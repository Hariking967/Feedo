import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { foodListing } from "@/db/schema";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  calculateSpoilageRisk,
  estimateTravelTime,
  getWeatherSnapshot,
  type Coordinate,
  type FoodCategory,
  type PackagingCondition,
  type StorageCondition,
} from "@/lib/spoilage-risk";
import { recipients, volunteers } from "@/lib/platform/mock-data";
import { appendLifecycleEvent } from "@/lib/lifecycle-events";

interface DispatchCandidate {
  userId: string;
  role: "volunteer" | "receiver";
  displayName: string;
  lat: number;
  lng: number;
}

interface CandidateWithDuration extends DispatchCandidate {
  durationMinutes: number;
}

interface NotificationSendResult {
  attempted: number;
  sent: number;
  failed: number;
  mode: "fcm" | "queued" | "disabled";
}

const payloadSchema = z.object({
  foodName: z.string().min(2),
  quantity: z.number().int().positive(),
  foodCategory: z.enum(["veg", "non_veg", "dairy", "bakery", "rice", "seafood"]),
  cookedAt: z.string(),
  packagingCondition: z.enum(["sealed", "good", "average", "damaged"]),
  storageCondition: z.enum(["refrigerated", "insulated", "room_temp", "outdoor"]),
  pickupAddress: z.string().min(3).optional(),
  pickupLocation: z.object({
    lat: z.number(),
    lng: z.number(),
  }),
  destinationLocation: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .optional(),
  price: z.number().int().nonnegative(),
  safeWindowMinutes: z.number().int().min(20).max(240).optional(),
});

const defaultDestination = { lat: 12.9716, lng: 77.5946 };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceBetweenKm(start: Coordinate, end: Coordinate) {
  const earthRadiusKm = 6371;
  const latDelta = toRadians(end.lat - start.lat);
  const lngDelta = toRadians(end.lng - start.lng);
  const lat1 = toRadians(start.lat);
  const lat2 = toRadians(end.lat);

  const haversineTerm =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(lngDelta / 2) * Math.sin(lngDelta / 2);

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(haversineTerm), Math.sqrt(1 - haversineTerm));
}

function getMockCandidates(): DispatchCandidate[] {
  const volunteerCandidates = volunteers
    .filter((item) => item.availabilityStatus === "available")
    .map((item) => ({
      userId: item.id,
      role: "volunteer" as const,
      displayName: item.name,
      lat: item.location.lat,
      lng: item.location.lng,
    }));

  const receiverCandidates = recipients
    .filter((item) => item.open && item.verified)
    .map((item) => ({
      userId: item.id,
      role: "receiver" as const,
      displayName: item.name,
      lat: item.location.lat,
      lng: item.location.lng,
    }));

  return [...volunteerCandidates, ...receiverCandidates];
}

async function loadSupabaseCandidates(): Promise<DispatchCandidate[]> {
  if (!supabaseAdmin) {
    return getMockCandidates();
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("responder_presence")
      .select("user_id, role, display_name, lat, lng, active")
      .in("role", ["volunteer", "receiver", "ngo", "recipient"])
      .eq("active", true)
      .limit(120);

    if (error || !data?.length) {
      return getMockCandidates();
    }

    const parsed = data
      .map((row) => {
        const role = row.role === "volunteer" ? "volunteer" : "receiver";
        const lat = Number(row.lat);
        const lng = Number(row.lng);
        if (!row.user_id || !Number.isFinite(lat) || !Number.isFinite(lng)) {
          return null;
        }

        return {
          userId: String(row.user_id),
          role,
          displayName: row.display_name ? String(row.display_name) : role === "volunteer" ? "Volunteer" : "Receiver",
          lat,
          lng,
        } satisfies DispatchCandidate;
      })
      .filter((item): item is DispatchCandidate => Boolean(item));

    return parsed.length ? parsed : getMockCandidates();
  } catch {
    return getMockCandidates();
  }
}

async function estimateDurationsFromPickup(
  pickup: Coordinate,
  candidates: DispatchCandidate[],
): Promise<CandidateWithDuration[]> {
  if (!candidates.length) return [];

  const orsKey = process.env.OPENROUTESERVICE_API_KEY;

  if (orsKey) {
    try {
      const locations = [
        [pickup.lng, pickup.lat],
        ...candidates.map((item) => [item.lng, item.lat]),
      ];

      const response = await fetch("https://api.openrouteservice.org/v2/matrix/driving-car", {
        method: "POST",
        headers: {
          Authorization: orsKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          locations,
          metrics: ["duration"],
          sources: [0],
          destinations: candidates.map((_, index) => index + 1),
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as { durations?: number[][] };
        const durations = data.durations?.[0] ?? [];

        if (durations.length === candidates.length) {
          return candidates
            .map((candidate, index) => ({
              ...candidate,
              durationMinutes: Math.max(1, Math.round((durations[index] ?? Number.POSITIVE_INFINITY) / 60)),
            }))
            .filter((item) => Number.isFinite(item.durationMinutes));
        }
      }
    } catch {
      // Fall through to local estimate.
    }
  }

  return candidates.map((candidate) => {
    const distanceKm = distanceBetweenKm(pickup, { lat: candidate.lat, lng: candidate.lng });
    return {
      ...candidate,
      durationMinutes: Math.max(1, Math.round((distanceKm / 24) * 60)),
    };
  });
}

async function sendEmergencyPush(
  userIds: string[],
  payload: {
    title: string;
    body: string;
    listingId: string;
    supplierName: string;
    pickupAddress: string;
    safeWindowMinutes: number;
  },
): Promise<NotificationSendResult> {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueUserIds.length) {
    return { attempted: 0, sent: 0, failed: 0, mode: "disabled" };
  }

  if (!supabaseAdmin) {
    return { attempted: uniqueUserIds.length, sent: 0, failed: uniqueUserIds.length, mode: "disabled" };
  }

  let tokens: string[] = [];
  try {
    const { data } = await supabaseAdmin
      .from("push_tokens")
      .select("token, user_id")
      .in("user_id", uniqueUserIds)
      .limit(300);

    tokens = (data ?? [])
      .map((row) => (typeof row.token === "string" ? row.token.trim() : ""))
      .filter(Boolean);
  } catch {
    tokens = [];
  }

  if (!tokens.length) {
    return { attempted: uniqueUserIds.length, sent: 0, failed: 0, mode: "queued" };
  }

  const serverKey = process.env.FIREBASE_SERVER_KEY;
  if (!serverKey) {
    try {
      await supabaseAdmin
        .from("notification_outbox")
        .insert(
          tokens.map((token) => ({
            token,
            title: payload.title,
            body: payload.body,
            data: {
              listingId: payload.listingId,
              supplierName: payload.supplierName,
              pickupAddress: payload.pickupAddress,
              safeWindowMinutes: String(payload.safeWindowMinutes),
              kind: "emergency_donation",
            },
            created_at: new Date().toISOString(),
          })),
        );
    } catch {
      // Optional queue fallback.
    }

    return { attempted: tokens.length, sent: 0, failed: 0, mode: "queued" };
  }

  let sent = 0;
  let failed = 0;

  await Promise.all(
    tokens.map(async (token) => {
      try {
        const response = await fetch("https://fcm.googleapis.com/fcm/send", {
          method: "POST",
          headers: {
            Authorization: `key=${serverKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: token,
            priority: "high",
            notification: {
              title: payload.title,
              body: payload.body,
            },
            data: {
              listingId: payload.listingId,
              supplierName: payload.supplierName,
              pickupAddress: payload.pickupAddress,
              safeWindowMinutes: String(payload.safeWindowMinutes),
              kind: "emergency_donation",
            },
          }),
        });

        if (response.ok) {
          sent += 1;
        } else {
          failed += 1;
        }
      } catch {
        failed += 1;
      }
    }),
  );

  return { attempted: tokens.length, sent, failed, mode: "fcm" };
}

async function mirrorFoodListingToSupabase(record: {
  id: string;
  supplier_user_id: string;
  supplier_name: string;
  food_name: string;
  quantity: number;
  food_category: string;
  cooked_at: string;
  packaging_condition: string;
  storage_condition: string;
  pickup_address: string | null;
  pickup_lat: number;
  pickup_lng: number;
  delivery_lat: number | null;
  delivery_lng: number | null;
  price: number;
  route_duration_minutes: number;
  route_distance_km: number;
  weather_temp_c: number;
  weather_humidity_pct: number;
  spoilage_score: number;
  spoilage_label: string;
  recommended_pickup_window_minutes: number;
  is_emergency: boolean;
  priority_level: string;
  priority_state: string;
  expected_response_minutes: number | null;
  assigned_volunteer_id: string | null;
  assigned_receiver_id: string | null;
  emergency_activated_at: string | null;
  emergency_expires_at: string | null;
  last_dispatch_at: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  last_risk_calculated_at: string;
}) {
  if (!supabaseAdmin) return;

  await supabaseAdmin.from("food_listing").upsert(record, { onConflict: "id" });
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as unknown;
    const parsed = payloadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
    }

    const cookedAt = new Date(parsed.data.cookedAt);
    if (Number.isNaN(cookedAt.getTime())) {
      return NextResponse.json({ error: "Invalid cookedAt timestamp" }, { status: 400 });
    }

    const pickup = parsed.data.pickupLocation;
    const destination = parsed.data.destinationLocation ?? defaultDestination;

    const [weather, travel] = await Promise.all([
      getWeatherSnapshot(pickup.lat, pickup.lng),
      estimateTravelTime(pickup, destination),
    ]);

    const risk = calculateSpoilageRisk({
      foodCategory: parsed.data.foodCategory as FoodCategory,
      cookedAt,
      packagingCondition: parsed.data.packagingCondition as PackagingCondition,
      storageCondition: parsed.data.storageCondition as StorageCondition,
      weather,
      travel,
    });

    const requestedWindow = parsed.data.safeWindowMinutes ?? risk.recommendedPickupWindowMinutes;
    const safeWindowMinutes = clamp(requestedWindow, 20, 240);

    const candidates = await loadSupabaseCandidates();
    const candidatesWithDurations = await estimateDurationsFromPickup(pickup, candidates);

    const topVolunteers = candidatesWithDurations
      .filter((item) => item.role === "volunteer" && item.durationMinutes <= safeWindowMinutes)
      .sort((a, b) => a.durationMinutes - b.durationMinutes)
      .slice(0, 3);

    const topReceivers = candidatesWithDurations
      .filter((item) => item.role === "receiver" && item.durationMinutes <= safeWindowMinutes)
      .sort((a, b) => a.durationMinutes - b.durationMinutes)
      .slice(0, 3);

    const assignedVolunteer = topVolunteers[0] ?? null;
    const assignedReceiver = topReceivers[0] ?? null;

    const expectedResponseMinutes =
      assignedVolunteer && assignedReceiver
        ? Math.max(assignedVolunteer.durationMinutes, assignedReceiver.durationMinutes)
        : assignedVolunteer?.durationMinutes ?? assignedReceiver?.durationMinutes ?? null;

    const hasFeasibleResponder = Boolean(assignedVolunteer || assignedReceiver);
    const status = hasFeasibleResponder ? "active" : "expired";
    const priorityState = !hasFeasibleResponder
      ? "expired_no_feasible_route"
      : assignedVolunteer && assignedReceiver
        ? "urgent_circulating"
        : "urgent_partial_match";

    const now = new Date();
    const emergencyExpiresAt = new Date(now.getTime() + safeWindowMinutes * 60 * 1000);
    const listingId = `fl-emg-${crypto.randomUUID()}`;

    await db.insert(foodListing).values({
      id: listingId,
      supplierUserId: session.user.id,
      supplierName: session.user.name ?? "Supplier",
      foodName: parsed.data.foodName.trim(),
      quantity: parsed.data.quantity,
      foodCategory: parsed.data.foodCategory,
      cookedAt,
      packagingCondition: parsed.data.packagingCondition,
      storageCondition: parsed.data.storageCondition,
      pickupAddress: parsed.data.pickupAddress?.trim() || null,
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      deliveryLat: destination.lat,
      deliveryLng: destination.lng,
      price: parsed.data.price,
      routeDurationMinutes: travel.durationMinutes,
      routeDistanceKm: travel.distanceKm,
      weatherTempC: weather.temperatureC,
      weatherHumidityPct: Math.round(weather.humidityPct),
      spoilageScore: risk.score,
      spoilageLabel: risk.label,
      recommendedPickupWindowMinutes: safeWindowMinutes,
      isEmergency: true,
      priorityLevel: "high",
      priorityState,
      expectedResponseMinutes,
      assignedVolunteerId: assignedVolunteer?.userId ?? null,
      assignedReceiverId: assignedReceiver?.userId ?? null,
      emergencyActivatedAt: now,
      emergencyExpiresAt,
      lastDispatchAt: now,
      status,
      createdAt: now,
      updatedAt: now,
      lastRiskCalculatedAt: now,
    });

    const [saved] = await db.select().from(foodListing).where(eq(foodListing.id, listingId)).limit(1);

    if (!saved) {
      return NextResponse.json({ error: "Unable to persist emergency listing" }, { status: 500 });
    }

    await mirrorFoodListingToSupabase({
      id: saved.id,
      supplier_user_id: saved.supplierUserId,
      supplier_name: saved.supplierName,
      food_name: saved.foodName,
      quantity: saved.quantity,
      food_category: saved.foodCategory,
      cooked_at: saved.cookedAt.toISOString(),
      packaging_condition: saved.packagingCondition,
      storage_condition: saved.storageCondition,
      pickup_address: saved.pickupAddress,
      pickup_lat: saved.pickupLat,
      pickup_lng: saved.pickupLng,
      delivery_lat: saved.deliveryLat,
      delivery_lng: saved.deliveryLng,
      price: saved.price,
      route_duration_minutes: saved.routeDurationMinutes,
      route_distance_km: saved.routeDistanceKm,
      weather_temp_c: saved.weatherTempC,
      weather_humidity_pct: saved.weatherHumidityPct,
      spoilage_score: saved.spoilageScore,
      spoilage_label: saved.spoilageLabel,
      recommended_pickup_window_minutes: saved.recommendedPickupWindowMinutes,
      is_emergency: saved.isEmergency,
      priority_level: saved.priorityLevel,
      priority_state: saved.priorityState,
      expected_response_minutes: saved.expectedResponseMinutes,
      assigned_volunteer_id: saved.assignedVolunteerId,
      assigned_receiver_id: saved.assignedReceiverId,
      emergency_activated_at: saved.emergencyActivatedAt ? saved.emergencyActivatedAt.toISOString() : null,
      emergency_expires_at: saved.emergencyExpiresAt ? saved.emergencyExpiresAt.toISOString() : null,
      last_dispatch_at: saved.lastDispatchAt ? saved.lastDispatchAt.toISOString() : null,
      status: saved.status,
      created_at: saved.createdAt.toISOString(),
      updated_at: saved.updatedAt.toISOString(),
      last_risk_calculated_at: saved.lastRiskCalculatedAt.toISOString(),
    }).catch(() => {
      // Mirror is optional.
    });

    if (supabaseAdmin) {
      try {
        await supabaseAdmin
          .from("emergency_donations")
          .upsert(
            {
              id: listingId,
              listing_id: listingId,
              supplier_user_id: saved.supplierUserId,
              pickup_lat: saved.pickupLat,
              pickup_lng: saved.pickupLng,
              safe_window_minutes: safeWindowMinutes,
              priority_state: priorityState,
              expected_response_minutes: expectedResponseMinutes,
              status,
              assigned_volunteer_id: assignedVolunteer?.userId ?? null,
              assigned_receiver_id: assignedReceiver?.userId ?? null,
              created_at: now.toISOString(),
              updated_at: now.toISOString(),
              expires_at: emergencyExpiresAt.toISOString(),
            },
            { onConflict: "id" },
          );
      } catch {
        // Optional mirror table.
      }
    }

    const userIdsForAlert = [
      ...topVolunteers.map((item) => item.userId),
      ...topReceivers.map((item) => item.userId),
    ];

    const notifyResult = await sendEmergencyPush(userIdsForAlert, {
      title: "Emergency pickup required",
      body: `${saved.foodName} needs pickup in ${safeWindowMinutes} min near ${saved.pickupAddress ?? "supplier location"}.`,
      listingId,
      supplierName: saved.supplierName,
      pickupAddress: saved.pickupAddress ?? "Supplier location",
      safeWindowMinutes,
    });

    await appendLifecycleEvent({
      listingId: saved.id,
      supplierUserId: saved.supplierUserId,
      actorUserId: session.user.id,
      actorRole: "supplier",
      eventType: "emergency_triggered",
      statusAfter: saved.priorityState,
      payload: {
        safeWindowMinutes,
        expectedResponseMinutes,
        assignedVolunteerId: assignedVolunteer?.userId ?? null,
        assignedReceiverId: assignedReceiver?.userId ?? null,
      },
    });

    if (assignedVolunteer) {
      await appendLifecycleEvent({
        listingId: saved.id,
        supplierUserId: saved.supplierUserId,
        actorUserId: assignedVolunteer.userId,
        actorRole: "system",
        eventType: "volunteer_assigned",
        statusAfter: "urgent_assigned",
        payload: { etaMinutes: assignedVolunteer.durationMinutes },
      });
    }

    return NextResponse.json({
      listing: saved,
      risk: {
        score: risk.score,
        label: risk.label,
        recommendedPickupWindowMinutes: safeWindowMinutes,
        reasons: risk.reasons,
      },
      emergency: {
        priorityLevel: "high",
        priorityState,
        expectedResponseMinutes,
        safeWindowMinutes,
        assignedVolunteer: assignedVolunteer
          ? {
              userId: assignedVolunteer.userId,
              displayName: assignedVolunteer.displayName,
              etaMinutes: assignedVolunteer.durationMinutes,
            }
          : null,
        assignedReceiver: assignedReceiver
          ? {
              userId: assignedReceiver.userId,
              displayName: assignedReceiver.displayName,
              etaMinutes: assignedReceiver.durationMinutes,
            }
          : null,
        topVolunteers: topVolunteers.map((item) => ({
          userId: item.userId,
          displayName: item.displayName,
          etaMinutes: item.durationMinutes,
        })),
        topReceivers: topReceivers.map((item) => ({
          userId: item.userId,
          displayName: item.displayName,
          etaMinutes: item.durationMinutes,
        })),
        notification: notifyResult,
      },
    });
  } catch {
    return NextResponse.json({ error: "Unable to trigger emergency circulation" }, { status: 500 });
  }
}
