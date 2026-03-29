import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  donationEvent,
  donationEventAllocation,
  donationItem,
  foodListing,
} from "@/db/schema";
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

interface ReceiverCandidate {
  userId: string;
  displayName: string;
  lat: number;
  lng: number;
  capacity: number;
}

interface VolunteerCandidate {
  userId: string;
  displayName: string;
  lat: number;
  lng: number;
}

interface ReceiverWithDuration extends ReceiverCandidate {
  durationMinutes: number;
}

interface VolunteerWithDuration extends VolunteerCandidate {
  durationMinutes: number;
}

const payloadSchema = z.object({
  eventName: z.string().min(2).max(120),
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
  safeWindowMinutes: z.number().int().min(20).max(360).optional(),
  pricePerMeal: z.number().int().nonnegative().optional(),
  items: z
    .array(
      z.object({
        foodName: z.string().min(2),
        quantity: z.number().int().positive(),
        foodCategory: z.enum(["veg", "non_veg", "dairy", "bakery", "rice", "seafood"]),
        cookedAt: z.string(),
        packagingCondition: z.enum(["sealed", "good", "average", "damaged"]),
        storageCondition: z.enum(["refrigerated", "insulated", "room_temp", "outdoor"]),
      }),
    )
    .min(1)
    .max(20),
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

async function loadReceivers(): Promise<ReceiverCandidate[]> {
  if (!supabaseAdmin) {
    return recipients
      .filter((item) => item.open && item.verified)
      .map((item) => ({
        userId: item.id,
        displayName: item.name,
        lat: item.location.lat,
        lng: item.location.lng,
        capacity: item.capacity,
      }));
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("responder_presence")
      .select("user_id, role, display_name, lat, lng, active, capacity")
      .in("role", ["receiver", "ngo", "recipient"])
      .eq("active", true)
      .limit(100);

    if (error || !data?.length) {
      throw new Error("no data");
    }

    const parsed = data
      .map((row) => {
        const lat = Number(row.lat);
        const lng = Number(row.lng);
        const capacity = Math.max(20, Number(row.capacity) || 120);
        if (!row.user_id || !Number.isFinite(lat) || !Number.isFinite(lng)) {
          return null;
        }

        return {
          userId: String(row.user_id),
          displayName: row.display_name ? String(row.display_name) : "Receiver",
          lat,
          lng,
          capacity,
        } satisfies ReceiverCandidate;
      })
      .filter((item): item is ReceiverCandidate => Boolean(item));

    return parsed.length
      ? parsed
      : recipients
          .filter((item) => item.open && item.verified)
          .map((item) => ({
            userId: item.id,
            displayName: item.name,
            lat: item.location.lat,
            lng: item.location.lng,
            capacity: item.capacity,
          }));
  } catch {
    return recipients
      .filter((item) => item.open && item.verified)
      .map((item) => ({
        userId: item.id,
        displayName: item.name,
        lat: item.location.lat,
        lng: item.location.lng,
        capacity: item.capacity,
      }));
  }
}

async function loadVolunteers(): Promise<VolunteerCandidate[]> {
  if (!supabaseAdmin) {
    return volunteers
      .filter((item) => item.availabilityStatus === "available")
      .map((item) => ({
        userId: item.id,
        displayName: item.name,
        lat: item.location.lat,
        lng: item.location.lng,
      }));
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("responder_presence")
      .select("user_id, role, display_name, lat, lng, active")
      .eq("role", "volunteer")
      .eq("active", true)
      .limit(120);

    if (error || !data?.length) {
      throw new Error("no data");
    }

    const parsed = data
      .map((row) => {
        const lat = Number(row.lat);
        const lng = Number(row.lng);
        if (!row.user_id || !Number.isFinite(lat) || !Number.isFinite(lng)) {
          return null;
        }

        return {
          userId: String(row.user_id),
          displayName: row.display_name ? String(row.display_name) : "Volunteer",
          lat,
          lng,
        } satisfies VolunteerCandidate;
      })
      .filter((item): item is VolunteerCandidate => Boolean(item));

    return parsed.length
      ? parsed
      : volunteers
          .filter((item) => item.availabilityStatus === "available")
          .map((item) => ({
            userId: item.id,
            displayName: item.name,
            lat: item.location.lat,
            lng: item.location.lng,
          }));
  } catch {
    return volunteers
      .filter((item) => item.availabilityStatus === "available")
      .map((item) => ({
        userId: item.id,
        displayName: item.name,
        lat: item.location.lat,
        lng: item.location.lng,
      }));
  }
}

async function estimateReceiverDurations(
  pickup: Coordinate,
  candidates: ReceiverCandidate[],
): Promise<ReceiverWithDuration[]> {
  if (!candidates.length) return [];

  const orsKey = process.env.OPENROUTESERVICE_API_KEY;

  if (orsKey) {
    try {
      const locations = [[pickup.lng, pickup.lat], ...candidates.map((item) => [item.lng, item.lat])];

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
      durationMinutes: Math.max(1, Math.round((distanceKm / 22) * 60)),
    };
  });
}

async function estimateVolunteerDurations(
  pickup: Coordinate,
  candidates: VolunteerCandidate[],
): Promise<VolunteerWithDuration[]> {
  if (!candidates.length) return [];

  return candidates.map((candidate) => {
    const distanceKm = distanceBetweenKm(pickup, { lat: candidate.lat, lng: candidate.lng });
    return {
      ...candidate,
      durationMinutes: Math.max(1, Math.round((distanceKm / 24) * 60)),
    };
  });
}

async function mirrorBulkEventToSupabase(record: {
  id: string;
  supplier_user_id: string;
  supplier_name: string;
  event_name: string;
  total_quantity: number;
  item_count: number;
  pickup_address: string | null;
  pickup_lat: number;
  pickup_lng: number;
  safe_window_minutes: number;
  allocation_strategy: string;
  allocation_summary: string | null;
  status: string;
  assigned_volunteer_id: string | null;
  expected_response_minutes: number | null;
  created_at: string;
  updated_at: string;
}) {
  if (!supabaseAdmin) return;
  await supabaseAdmin.from("donation_event").upsert(record, { onConflict: "id" });
}

async function mirrorBulkItemToSupabase(record: {
  id: string;
  donation_event_id: string;
  listing_id: string | null;
  food_name: string;
  food_category: string;
  quantity: number;
  cooked_at: string;
  packaging_condition: string;
  storage_condition: string;
  spoilage_score: number;
  spoilage_label: string;
  recommended_pickup_window_minutes: number;
  status: string;
  created_at: string;
  updated_at: string;
}) {
  if (!supabaseAdmin) return;
  await supabaseAdmin.from("donation_item").upsert(record, { onConflict: "id" });
}

async function mirrorBulkAllocationToSupabase(record: {
  id: string;
  donation_event_id: string;
  receiver_id: string;
  receiver_name: string;
  allocated_quantity: number;
  eta_minutes: number;
  allocation_type: string;
  created_at: string;
}) {
  if (!supabaseAdmin) return;
  await supabaseAdmin.from("donation_event_allocation").upsert(record, { onConflict: "id" });
}

async function mirrorFoodListingToSupabase(record: {
  id: string;
  supplier_user_id: string;
  bulk_event_id: string | null;
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

    const cookedTimeline = parsed.data.items.map((item) => new Date(item.cookedAt));
    if (cookedTimeline.some((value) => Number.isNaN(value.getTime()))) {
      return NextResponse.json({ error: "One or more cookedAt timestamps are invalid" }, { status: 400 });
    }

    const pickup = parsed.data.pickupLocation;
    const destination = parsed.data.destinationLocation ?? defaultDestination;

    const [weather, travel, receivers, volunteersPool] = await Promise.all([
      getWeatherSnapshot(pickup.lat, pickup.lng),
      estimateTravelTime(pickup, destination),
      loadReceivers(),
      loadVolunteers(),
    ]);

    const itemWithRisk = parsed.data.items.map((item, index) => {
      const risk = calculateSpoilageRisk({
        foodCategory: item.foodCategory as FoodCategory,
        cookedAt: cookedTimeline[index],
        packagingCondition: item.packagingCondition as PackagingCondition,
        storageCondition: item.storageCondition as StorageCondition,
        weather,
        travel,
      });

      return {
        item,
        cookedAt: cookedTimeline[index],
        risk,
      };
    });

    const tightestWindow = Math.min(...itemWithRisk.map((entry) => entry.risk.recommendedPickupWindowMinutes));
    const safeWindowMinutes = clamp(parsed.data.safeWindowMinutes ?? tightestWindow, 20, 360);

    const [receiverDurations, volunteerDurations] = await Promise.all([
      estimateReceiverDurations(pickup, receivers),
      estimateVolunteerDurations(pickup, volunteersPool),
    ]);

    const feasibleReceivers = receiverDurations
      .filter((candidate) => candidate.durationMinutes <= safeWindowMinutes)
      .sort((a, b) => a.durationMinutes - b.durationMinutes);

    const feasibleVolunteers = volunteerDurations
      .filter((candidate) => candidate.durationMinutes <= safeWindowMinutes)
      .sort((a, b) => a.durationMinutes - b.durationMinutes);

    const totalQuantity = parsed.data.items.reduce((sum, item) => sum + item.quantity, 0);

    const fullReceiver = feasibleReceivers.find((candidate) => candidate.capacity >= totalQuantity) ?? null;

    const allocations: Array<{
      receiverId: string;
      receiverName: string;
      allocatedQuantity: number;
      etaMinutes: number;
      allocationType: "full" | "split";
    }> = [];

    let allocationStrategy = "no_feasible_receiver";
    let allocationStatus = "expired";
    let unallocatedQuantity = totalQuantity;

    if (fullReceiver) {
      allocations.push({
        receiverId: fullReceiver.userId,
        receiverName: fullReceiver.displayName,
        allocatedQuantity: totalQuantity,
        etaMinutes: fullReceiver.durationMinutes,
        allocationType: "full",
      });
      allocationStrategy = "single_receiver_full";
      allocationStatus = "active";
      unallocatedQuantity = 0;
    } else if (feasibleReceivers.length) {
      let remaining = totalQuantity;
      for (const receiver of feasibleReceivers) {
        if (remaining <= 0) break;
        const allocated = Math.min(remaining, Math.max(1, receiver.capacity));
        allocations.push({
          receiverId: receiver.userId,
          receiverName: receiver.displayName,
          allocatedQuantity: allocated,
          etaMinutes: receiver.durationMinutes,
          allocationType: "split",
        });
        remaining -= allocated;
      }

      unallocatedQuantity = Math.max(0, remaining);
      allocationStrategy = unallocatedQuantity === 0 ? "split_multi_receiver" : "split_partial_capacity";
      allocationStatus = allocations.length ? (unallocatedQuantity === 0 ? "active" : "partial") : "expired";
    }

    const assignedVolunteer = feasibleVolunteers[0] ?? null;
    const expectedResponseMinutes = allocations.length
      ? Math.max(assignedVolunteer?.durationMinutes ?? 0, Math.min(...allocations.map((entry) => entry.etaMinutes)))
      : assignedVolunteer?.durationMinutes ?? null;

    const now = new Date();
    const eventId = `de-${crypto.randomUUID()}`;

    await db.insert(donationEvent).values({
      id: eventId,
      supplierUserId: session.user.id,
      supplierName: session.user.name ?? "Supplier",
      eventName: parsed.data.eventName.trim(),
      totalQuantity,
      itemCount: parsed.data.items.length,
      pickupAddress: parsed.data.pickupAddress?.trim() || null,
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      safeWindowMinutes,
      allocationStrategy,
      allocationSummary: `Allocated ${totalQuantity - unallocatedQuantity}/${totalQuantity} meals across ${allocations.length} receiver(s).`,
      status: allocationStatus,
      assignedVolunteerId: assignedVolunteer?.userId ?? null,
      expectedResponseMinutes,
      createdAt: now,
      updatedAt: now,
    });

    await mirrorBulkEventToSupabase({
      id: eventId,
      supplier_user_id: session.user.id,
      supplier_name: session.user.name ?? "Supplier",
      event_name: parsed.data.eventName.trim(),
      total_quantity: totalQuantity,
      item_count: parsed.data.items.length,
      pickup_address: parsed.data.pickupAddress?.trim() || null,
      pickup_lat: pickup.lat,
      pickup_lng: pickup.lng,
      safe_window_minutes: safeWindowMinutes,
      allocation_strategy: allocationStrategy,
      allocation_summary: `Allocated ${totalQuantity - unallocatedQuantity}/${totalQuantity} meals across ${allocations.length} receiver(s).`,
      status: allocationStatus,
      assigned_volunteer_id: assignedVolunteer?.userId ?? null,
      expected_response_minutes: expectedResponseMinutes,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    }).catch(() => {
      // Optional mirror.
    });

    await appendLifecycleEvent({
      donationEventId: eventId,
      supplierUserId: session.user.id,
      actorUserId: session.user.id,
      actorRole: "supplier",
      eventType: allocations.length > 1 ? "allocation_split" : "allocation_completed",
      statusAfter: allocationStatus,
      payload: {
        totalQuantity,
        allocatedQuantity: totalQuantity - unallocatedQuantity,
        receiverCount: allocations.length,
        strategy: allocationStrategy,
      },
    });

    const insertedListings: Array<{
      id: string;
      foodName: string;
      supplierName: string;
      supplierUserId: string;
      foodCategory: string;
      pickupLat: number;
      pickupLng: number;
      price: number;
      quantity: number;
      spoilageScore: number;
      spoilageLabel: string;
      recommendedPickupWindowMinutes: number;
    }> = [];

    for (const entry of itemWithRisk) {
      const listingId = `fl-bulk-${crypto.randomUUID()}`;
      const donationItemId = `di-${crypto.randomUUID()}`;
      await db.insert(foodListing).values({
        id: listingId,
        supplierUserId: session.user.id,
        bulkEventId: eventId,
        supplierName: session.user.name ?? "Supplier",
        foodName: entry.item.foodName.trim(),
        quantity: entry.item.quantity,
        foodCategory: entry.item.foodCategory,
        cookedAt: entry.cookedAt,
        packagingCondition: entry.item.packagingCondition,
        storageCondition: entry.item.storageCondition,
        pickupAddress: parsed.data.pickupAddress?.trim() || null,
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        deliveryLat: destination.lat,
        deliveryLng: destination.lng,
        price: parsed.data.pricePerMeal ?? 0,
        routeDurationMinutes: travel.durationMinutes,
        routeDistanceKm: travel.distanceKm,
        weatherTempC: weather.temperatureC,
        weatherHumidityPct: Math.round(weather.humidityPct),
        spoilageScore: entry.risk.score,
        spoilageLabel: entry.risk.label,
        recommendedPickupWindowMinutes: Math.min(entry.risk.recommendedPickupWindowMinutes, safeWindowMinutes),
        isEmergency: false,
        priorityLevel: "bulk",
        priorityState: allocationStatus,
        expectedResponseMinutes,
        assignedVolunteerId: assignedVolunteer?.userId ?? null,
        assignedReceiverId: allocations[0]?.receiverId ?? null,
        emergencyActivatedAt: null,
        emergencyExpiresAt: null,
        lastDispatchAt: now,
        status: allocationStatus,
        createdAt: now,
        updatedAt: now,
        lastRiskCalculatedAt: now,
      });

      await db.insert(donationItem).values({
        id: donationItemId,
        donationEventId: eventId,
        listingId,
        foodName: entry.item.foodName.trim(),
        foodCategory: entry.item.foodCategory,
        quantity: entry.item.quantity,
        cookedAt: entry.cookedAt,
        packagingCondition: entry.item.packagingCondition,
        storageCondition: entry.item.storageCondition,
        spoilageScore: entry.risk.score,
        spoilageLabel: entry.risk.label,
        recommendedPickupWindowMinutes: Math.min(entry.risk.recommendedPickupWindowMinutes, safeWindowMinutes),
        status: allocationStatus,
        createdAt: now,
        updatedAt: now,
      });

      await mirrorFoodListingToSupabase({
        id: listingId,
        supplier_user_id: session.user.id,
        bulk_event_id: eventId,
        supplier_name: session.user.name ?? "Supplier",
        food_name: entry.item.foodName.trim(),
        quantity: entry.item.quantity,
        food_category: entry.item.foodCategory,
        cooked_at: entry.cookedAt.toISOString(),
        packaging_condition: entry.item.packagingCondition,
        storage_condition: entry.item.storageCondition,
        pickup_address: parsed.data.pickupAddress?.trim() || null,
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        delivery_lat: destination.lat,
        delivery_lng: destination.lng,
        price: parsed.data.pricePerMeal ?? 0,
        route_duration_minutes: travel.durationMinutes,
        route_distance_km: travel.distanceKm,
        weather_temp_c: weather.temperatureC,
        weather_humidity_pct: Math.round(weather.humidityPct),
        spoilage_score: entry.risk.score,
        spoilage_label: entry.risk.label,
        recommended_pickup_window_minutes: Math.min(entry.risk.recommendedPickupWindowMinutes, safeWindowMinutes),
        is_emergency: false,
        priority_level: "bulk",
        priority_state: allocationStatus,
        expected_response_minutes: expectedResponseMinutes,
        assigned_volunteer_id: assignedVolunteer?.userId ?? null,
        assigned_receiver_id: allocations[0]?.receiverId ?? null,
        emergency_activated_at: null,
        emergency_expires_at: null,
        last_dispatch_at: now.toISOString(),
        status: allocationStatus,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        last_risk_calculated_at: now.toISOString(),
      }).catch(() => {
        // Optional mirror.
      });

      await mirrorBulkItemToSupabase({
        id: donationItemId,
        donation_event_id: eventId,
        listing_id: listingId,
        food_name: entry.item.foodName.trim(),
        food_category: entry.item.foodCategory,
        quantity: entry.item.quantity,
        cooked_at: entry.cookedAt.toISOString(),
        packaging_condition: entry.item.packagingCondition,
        storage_condition: entry.item.storageCondition,
        spoilage_score: entry.risk.score,
        spoilage_label: entry.risk.label,
        recommended_pickup_window_minutes: Math.min(entry.risk.recommendedPickupWindowMinutes, safeWindowMinutes),
        status: allocationStatus,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      }).catch(() => {
        // Optional mirror.
      });

      insertedListings.push({
        id: listingId,
        foodName: entry.item.foodName.trim(),
        supplierName: session.user.name ?? "Supplier",
        supplierUserId: session.user.id,
        foodCategory: entry.item.foodCategory,
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        price: parsed.data.pricePerMeal ?? 0,
        quantity: entry.item.quantity,
        spoilageScore: entry.risk.score,
        spoilageLabel: entry.risk.label,
        recommendedPickupWindowMinutes: Math.min(entry.risk.recommendedPickupWindowMinutes, safeWindowMinutes),
      });
    }

    if (allocations.length) {
      const allocationRows = allocations.map((allocation) => ({
        id: `dea-${crypto.randomUUID()}`,
        donationEventId: eventId,
        receiverId: allocation.receiverId,
        receiverName: allocation.receiverName,
        allocatedQuantity: allocation.allocatedQuantity,
        etaMinutes: allocation.etaMinutes,
        allocationType: allocation.allocationType,
        createdAt: now,
      }));

      await db.insert(donationEventAllocation).values(allocationRows);

      await Promise.all(
        allocationRows.map((allocation) =>
          mirrorBulkAllocationToSupabase({
            id: allocation.id,
            donation_event_id: allocation.donationEventId,
            receiver_id: allocation.receiverId,
            receiver_name: allocation.receiverName,
            allocated_quantity: allocation.allocatedQuantity,
            eta_minutes: allocation.etaMinutes,
            allocation_type: allocation.allocationType,
            created_at: now.toISOString(),
          }).catch(() => {
            // Optional mirror.
          }),
        ),
      );
    }

    const [savedEvent] = await db.select().from(donationEvent).where(eq(donationEvent.id, eventId)).limit(1);

    if (!savedEvent) {
      return NextResponse.json({ error: "Bulk donation event was created but could not be retrieved" }, { status: 500 });
    }

    return NextResponse.json({
      event: savedEvent,
      logistics: {
        strategy: allocationStrategy,
        status: allocationStatus,
        safeWindowMinutes,
        totalQuantity,
        unallocatedQuantity,
        expectedResponseMinutes,
        assignedVolunteer: assignedVolunteer
          ? {
              userId: assignedVolunteer.userId,
              displayName: assignedVolunteer.displayName,
              etaMinutes: assignedVolunteer.durationMinutes,
            }
          : null,
        allocations,
      },
      listings: insertedListings,
    });
  } catch {
    return NextResponse.json({ error: "Unable to publish bulk donation event" }, { status: 500 });
  }
}
