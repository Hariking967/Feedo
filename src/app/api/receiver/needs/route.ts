import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const payloadSchema = z.object({
  needTitle: z.string().min(3).max(140),
  requiredMeals: z.number().int().min(1).max(20000),
  foodPreference: z.enum(["any", "veg", "non_veg", "dairy", "bakery", "rice", "seafood"]),
  mealSlot: z.enum(["tonight", "breakfast", "lunch", "dinner", "custom"]),
  windowStartAt: z.string(),
  windowEndAt: z.string(),
  urgencyLevel: z.enum(["low", "medium", "high", "critical"]),
  note: z.string().max(600).optional(),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
    address: z.string().min(3).max(240).optional(),
  }),
  radiusKm: z.number().min(1).max(50).optional(),
  crisisOverride: z.enum(["auto", "force_on"]).optional(),
});

interface SupplierCandidate {
  supplierUserId: string;
  supplierName: string;
  lat: number;
  lng: number;
  recentListingCount: number;
  avgQuantity: number;
  latestCreatedAt: string;
  distanceKm: number;
  promptScore: number;
}

interface RequestUser {
  userId: string;
  userName: string;
  source: "session" | "header-fallback";
}

interface CrisisSignal {
  active: boolean;
  severity: "normal" | "elevated" | "critical";
  reason: string;
  source: Array<"weather" | "manual-zone" | "receiver-override">;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceBetweenKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const earthRadiusKm = 6371;
  const latDelta = toRadians(b.lat - a.lat);
  const lngDelta = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const x =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.sin(lngDelta / 2) * Math.sin(lngDelta / 2) * Math.cos(lat1) * Math.cos(lat2);

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function minutesFromMidnight(value: Date) {
  return value.getHours() * 60 + value.getMinutes();
}

function scheduleProximityScore(windowStart: Date, supplierLatestActivity: Date) {
  const requestMinutes = minutesFromMidnight(windowStart);
  const supplierMinutes = minutesFromMidnight(supplierLatestActivity);
  const diff = Math.abs(requestMinutes - supplierMinutes);
  return clamp(1 - diff / 360, 0, 1);
}

async function sendNeedPrompt(
  supplierUserIds: string[],
  payload: {
    title: string;
    body: string;
    needRequestId: string;
    receiverUserId: string;
    urgencyLevel: string;
  },
) {
  if (!supabaseAdmin || !supplierUserIds.length) {
    return { attempted: 0, sent: 0, queued: 0, mode: "disabled" as const };
  }

  let tokens: string[] = [];

  try {
    const { data } = await supabaseAdmin
      .from("push_tokens")
      .select("token, user_id")
      .in("user_id", supplierUserIds)
      .limit(500);

    tokens = (data ?? [])
      .map((row) => (typeof row.token === "string" ? row.token.trim() : ""))
      .filter(Boolean);
  } catch {
    tokens = [];
  }

  if (!tokens.length) {
    return { attempted: supplierUserIds.length, sent: 0, queued: 0, mode: "disabled" as const };
  }

  const serverKey = process.env.FIREBASE_SERVER_KEY;

  if (!serverKey) {
    try {
      await supabaseAdmin.from("notification_outbox").insert(
        tokens.map((token) => ({
          token,
          title: payload.title,
          body: payload.body,
          data: {
            kind: "receiver_need_prompt",
            needRequestId: payload.needRequestId,
            receiverUserId: payload.receiverUserId,
            urgencyLevel: payload.urgencyLevel,
          },
          created_at: new Date().toISOString(),
        })),
      );
    } catch {
      // Optional queue fallback.
    }

    return { attempted: tokens.length, sent: 0, queued: tokens.length, mode: "queued" as const };
  }

  let sent = 0;

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
              kind: "receiver_need_prompt",
              needRequestId: payload.needRequestId,
              receiverUserId: payload.receiverUserId,
              urgencyLevel: payload.urgencyLevel,
            },
          }),
        });

        if (response.ok) {
          sent += 1;
        }
      } catch {
        // Continue best-effort.
      }
    }),
  );

  return { attempted: tokens.length, sent, queued: Math.max(0, tokens.length - sent), mode: "fcm" as const };
}

async function loadSupplierCandidates(windowStartAt: Date, foodPreference: string, needLocation: { lat: number; lng: number }) {
  if (!supabaseAdmin) return [] as SupplierCandidate[];

  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    let query = supabaseAdmin
      .from("food_listing")
      .select("supplier_user_id, supplier_name, pickup_lat, pickup_lng, quantity, food_category, created_at")
      .gte("created_at", since)
      .in("status", ["active", "matched", "assigned", "delivered", "partial"])
      .limit(600);

    if (foodPreference !== "any") {
      query = query.eq("food_category", foodPreference);
    }

    const { data, error } = await query;

    if (error || !data) return [];

    const grouped = new Map<string, {
      supplierUserId: string;
      supplierName: string;
      lat: number;
      lng: number;
      recentListingCount: number;
      avgQuantity: number;
      quantityTotal: number;
      latestCreatedAt: string;
    }>();

    for (const row of data) {
      const supplierUserId = String(row.supplier_user_id ?? "");
      if (!supplierUserId) continue;

      const lat = Number(row.pickup_lat);
      const lng = Number(row.pickup_lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const distanceKm = distanceBetweenKm(needLocation, { lat, lng });
      if (distanceKm > 50) continue;

      const quantity = Math.max(1, Number(row.quantity ?? 1));
      const createdAt = String(row.created_at ?? new Date().toISOString());

      const existing = grouped.get(supplierUserId);

      if (!existing) {
        grouped.set(supplierUserId, {
          supplierUserId,
          supplierName: String(row.supplier_name ?? "Supplier"),
          lat,
          lng,
          recentListingCount: 1,
          avgQuantity: quantity,
          quantityTotal: quantity,
          latestCreatedAt: createdAt,
        });
      } else {
        existing.recentListingCount += 1;
        existing.quantityTotal += quantity;
        existing.avgQuantity = Math.round(existing.quantityTotal / existing.recentListingCount);

        if (new Date(createdAt).getTime() > new Date(existing.latestCreatedAt).getTime()) {
          existing.latestCreatedAt = createdAt;
          existing.lat = lat;
          existing.lng = lng;
        }
      }
    }

    const candidates = [...grouped.values()].map((item) => {
      const latestActivity = new Date(item.latestCreatedAt);
      const distanceKm = distanceBetweenKm(needLocation, { lat: item.lat, lng: item.lng });
      const distanceScore = clamp(1 - distanceKm / 25, 0, 1);
      const surplusPatternScore = clamp(item.recentListingCount / 10, 0, 1);
      const quantityPatternScore = clamp(item.avgQuantity / 120, 0, 1);
      const scheduleScore = scheduleProximityScore(windowStartAt, latestActivity);
      const recencyHours = Math.max(1, (Date.now() - latestActivity.getTime()) / (1000 * 60 * 60));
      const recencyScore = clamp(1 - recencyHours / 96, 0, 1);

      const promptScore = Math.round(
        (surplusPatternScore * 0.3 + quantityPatternScore * 0.2 + distanceScore * 0.25 + scheduleScore * 0.15 + recencyScore * 0.1) *
          100,
      );

      return {
        supplierUserId: item.supplierUserId,
        supplierName: item.supplierName,
        lat: item.lat,
        lng: item.lng,
        recentListingCount: item.recentListingCount,
        avgQuantity: item.avgQuantity,
        latestCreatedAt: item.latestCreatedAt,
        distanceKm: Number(distanceKm.toFixed(1)),
        promptScore,
      };
    });

    return candidates.sort((a, b) => b.promptScore - a.promptScore).slice(0, 15);
  } catch {
    return [];
  }
}

async function detectCrisisAtLocation(location: { lat: number; lng: number }): Promise<CrisisSignal> {
  const weatherKey = process.env.OPENWEATHER_API_KEY;
  let weatherActive = false;
  let storm = false;
  let heavyRain = false;
  let extremeHeat = false;

  if (weatherKey) {
    try {
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${location.lat}&lon=${location.lng}&appid=${weatherKey}&units=metric`,
        { cache: "no-store" },
      );

      if (response.ok) {
        const json = (await response.json()) as {
          weather?: Array<{ main?: string }>;
          main?: { temp?: number };
          wind?: { speed?: number };
          rain?: { "1h"?: number; "3h"?: number };
        };

        const condition = String(json.weather?.[0]?.main ?? "").toLowerCase();
        const temp = Number(json.main?.temp ?? 30);
        const wind = Number(json.wind?.speed ?? 0);
        const rain1h = Number(json.rain?.["1h"] ?? 0);
        const rain3h = Number(json.rain?.["3h"] ?? 0);

        heavyRain = rain1h >= 6 || rain3h >= 15 || condition.includes("rain");
        extremeHeat = temp >= 38;
        storm = condition.includes("storm") || wind >= 13.9;
        weatherActive = heavyRain || extremeHeat || storm;
      }
    } catch {
      // Weather signals are best effort.
    }
  }

  let manualZoneActive = false;
  if (supabaseAdmin) {
    try {
      const { data } = await supabaseAdmin
        .from("crisis_zone")
        .select("center_lat, center_lng, radius_km, active")
        .eq("active", true)
        .limit(50);

      for (const row of data ?? []) {
        const centerLat = Number((row as { center_lat?: number }).center_lat);
        const centerLng = Number((row as { center_lng?: number }).center_lng);
        const radiusKm = Number((row as { radius_km?: number }).radius_km ?? 0);
        if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng) || !Number.isFinite(radiusKm)) {
          continue;
        }

        const distance = distanceBetweenKm(location, { lat: centerLat, lng: centerLng });
        if (distance <= radiusKm) {
          manualZoneActive = true;
          break;
        }
      }
    } catch {
      // Table may be absent.
    }
  }

  const active = weatherActive || manualZoneActive;
  const source: Array<"weather" | "manual-zone" | "receiver-override"> = [];
  if (weatherActive) source.push("weather");
  if (manualZoneActive) source.push("manual-zone");

  return {
    active,
    severity: (storm && heavyRain) || (manualZoneActive && extremeHeat) ? "critical" : active ? "elevated" : "normal",
    reason: active ? "Crisis indicators detected near receiver request" : "No crisis indicators",
    source,
  };
}

async function sendCrisisNearbyPush(
  userIds: string[],
  payload: {
    title: string;
    body: string;
    needRequestId: string;
    urgencyLevel: string;
  },
) {
  if (!supabaseAdmin || !userIds.length) {
    return { attempted: 0, sent: 0, queued: 0, mode: "disabled" as const };
  }

  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueUserIds.length) {
    return { attempted: 0, sent: 0, queued: 0, mode: "disabled" as const };
  }

  let tokens: string[] = [];

  try {
    const { data } = await supabaseAdmin
      .from("push_tokens")
      .select("token, user_id")
      .in("user_id", uniqueUserIds)
      .limit(600);

    tokens = (data ?? [])
      .map((row) => (typeof row.token === "string" ? row.token.trim() : ""))
      .filter(Boolean);
  } catch {
    tokens = [];
  }

  if (!tokens.length) {
    return { attempted: uniqueUserIds.length, sent: 0, queued: 0, mode: "disabled" as const };
  }

  const serverKey = process.env.FIREBASE_SERVER_KEY;
  if (!serverKey) {
    try {
      await supabaseAdmin.from("notification_outbox").insert(
        tokens.map((token) => ({
          token,
          title: payload.title,
          body: payload.body,
          data: {
            kind: "crisis_need_alert",
            needRequestId: payload.needRequestId,
            urgencyLevel: payload.urgencyLevel,
          },
          created_at: new Date().toISOString(),
        })),
      );
    } catch {
      // Queue fallback is optional.
    }

    return { attempted: tokens.length, sent: 0, queued: tokens.length, mode: "queued" as const };
  }

  let sent = 0;
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
              kind: "crisis_need_alert",
              needRequestId: payload.needRequestId,
              urgencyLevel: payload.urgencyLevel,
            },
          }),
        });

        if (response.ok) sent += 1;
      } catch {
        // Continue best-effort.
      }
    }),
  );

  return { attempted: tokens.length, sent, queued: Math.max(0, tokens.length - sent), mode: "fcm" as const };
}

async function loadNearbyParticipantUserIds(location: { lat: number; lng: number }, radiusKm: number) {
  if (!supabaseAdmin) return [] as string[];

  try {
    const { data, error } = await supabaseAdmin
      .from("responder_presence")
      .select("user_id, lat, lng, role, active")
      .in("role", ["volunteer", "receiver", "ngo", "recipient"])
      .eq("active", true)
      .limit(600);

    if (error || !data) return [];

    return data
      .map((row) => {
        const lat = Number(row.lat);
        const lng = Number(row.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        const distanceKm = distanceBetweenKm(location, { lat, lng });
        if (distanceKm > radiusKm) return null;
        return typeof row.user_id === "string" ? row.user_id : null;
      })
      .filter((value): value is string => Boolean(value));
  } catch {
    return [];
  }
}

async function resolveRequestUser(request: NextRequest): Promise<RequestUser | null> {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (session?.user?.id) {
      return {
        userId: session.user.id,
        userName: session.user.name ?? "Receiver",
        source: "session",
      };
    }
  } catch {
    // Fall through to header-based identity when auth session lookup is unavailable.
  }

  const headerUserId = request.headers.get("x-feedo-user-id")?.trim() ?? "";
  if (!headerUserId) return null;

  const headerUserName = request.headers.get("x-feedo-user-name")?.trim() || "Receiver";
  return {
    userId: headerUserId,
    userName: headerUserName,
    source: "header-fallback",
  };
}

export async function GET(request: NextRequest) {
  try {
    const requestUser = await resolveRequestUser(request);
    if (!requestUser?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({
        source: "mock",
        needs: [],
      });
    }

    const { data, error } = await supabaseAdmin
      .from("receiver_need_request")
      .select("id, need_title, required_meals, food_preference, meal_slot, window_start_at, window_end_at, urgency_level, note, location_lat, location_lng, location_address, status, created_at")
      .eq("receiver_user_id", requestUser.userId)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      // Degrade gracefully when Supabase is temporarily unavailable or schema is not provisioned.
      return NextResponse.json({
        source: "degraded",
        authMode: requestUser.source,
        warning: "Need history unavailable; returning empty list.",
        detail: error.message,
        needs: [],
      });
    }

    return NextResponse.json({
      source: "supabase",
      authMode: requestUser.source,
      needs: data ?? [],
    });
  } catch {
    // Keep receiver UI functional even if external services fail.
    return NextResponse.json({
      source: "degraded",
      warning: "Need history unavailable due to transient service issue.",
      needs: [],
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const requestUser = await resolveRequestUser(request);
    if (!requestUser?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as unknown;
    const parsed = payloadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
    }

    const input = parsed.data;
    const windowStartAt = new Date(input.windowStartAt);
    const windowEndAt = new Date(input.windowEndAt);

    if (Number.isNaN(windowStartAt.getTime()) || Number.isNaN(windowEndAt.getTime()) || windowEndAt <= windowStartAt) {
      return NextResponse.json({ error: "Invalid time window" }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({
        source: "mock",
        needRequestId: `need-${crypto.randomUUID()}`,
        message: "Supabase is not configured; need accepted in mock mode.",
        targetedSuppliers: [],
      });
    }

    const needRequestId = `rn-${crypto.randomUUID()}`;
    const radiusKm = clamp(input.radiusKm ?? 10, 1, 50);

    const { error: requestError } = await supabaseAdmin.from("receiver_need_request").insert({
      id: needRequestId,
      receiver_user_id: requestUser.userId,
      receiver_name: requestUser.userName,
      need_title: input.needTitle,
      required_meals: input.requiredMeals,
      food_preference: input.foodPreference,
      meal_slot: input.mealSlot,
      window_start_at: windowStartAt.toISOString(),
      window_end_at: windowEndAt.toISOString(),
      urgency_level: input.urgencyLevel,
      note: input.note ?? null,
      location_lat: input.location.lat,
      location_lng: input.location.lng,
      location_address: input.location.address ?? null,
      radius_km: radiusKm,
      status: "open",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (requestError) {
      return NextResponse.json({ error: "Unable to store need request", detail: requestError.message }, { status: 500 });
    }

    const needLocation = {
      lat: input.location.lat,
      lng: input.location.lng,
    };

    const [allCandidates, crisis] = await Promise.all([
      loadSupplierCandidates(windowStartAt, input.foodPreference, needLocation),
      detectCrisisAtLocation(needLocation),
    ]);

    const crisisMode = input.crisisOverride === "force_on"
      ? {
          ...crisis,
          active: true,
          severity: crisis.severity === "critical" ? "critical" : "elevated",
          reason: "Receiver manually enabled crisis mode",
          source: [...new Set([...crisis.source, "receiver-override"])],
        }
      : crisis;

    const allCandidatesFiltered = allCandidates.filter((item) => item.distanceKm <= radiusKm);
    const targetedSuppliers = crisisMode.active ? allCandidatesFiltered : allCandidatesFiltered.slice(0, 8);

    if (targetedSuppliers.length) {
      await supabaseAdmin.from("supplier_need_prompt").insert(
        targetedSuppliers.map((candidate) => ({
          id: `snp-${crypto.randomUUID()}`,
          need_request_id: needRequestId,
          supplier_user_id: candidate.supplierUserId,
          supplier_name: candidate.supplierName,
          prompt_score: candidate.promptScore,
          distance_km: candidate.distanceKm,
          recent_listing_count: candidate.recentListingCount,
          avg_quantity: candidate.avgQuantity,
          prompt_status: "sent",
          sent_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        })),
      );
    }

    const pushResult = await sendNeedPrompt(
      targetedSuppliers.map((candidate) => candidate.supplierUserId),
      {
        title: crisisMode.active ? "Crisis need nearby" : "Receiver need nearby",
        body: crisisMode.active
          ? `${input.requiredMeals} meals urgently needed in a crisis zone. Fastest safe response requested.`
          : `${input.requiredMeals} meals requested (${input.foodPreference}) for ${input.mealSlot}. Can you post surplus now?`,
        needRequestId,
        receiverUserId: requestUser.userId,
        urgencyLevel: input.urgencyLevel,
      },
    );

    const allNearbyParticipants = crisisMode.active
      ? await loadNearbyParticipantUserIds(needLocation, Math.min(50, Math.max(radiusKm, 20)))
      : [];

    const emergencyPush = crisisMode.active
      ? await sendCrisisNearbyPush(allNearbyParticipants, {
          title: "Crisis redistribution active",
          body: `${input.requiredMeals} meals requested near ${input.location.address ?? "your region"}. Volunteers and donors needed now.`,
          needRequestId,
          urgencyLevel: input.urgencyLevel,
        })
      : { attempted: 0, sent: 0, queued: 0, mode: "disabled" as const };

    return NextResponse.json({
      source: "supabase",
      needRequestId,
      receiver: {
        userId: requestUser.userId,
        name: requestUser.userName,
      },
      authMode: requestUser.source,
      request: {
        title: input.needTitle,
        requiredMeals: input.requiredMeals,
        foodPreference: input.foodPreference,
        mealSlot: input.mealSlot,
        urgencyLevel: input.urgencyLevel,
        windowStartAt: windowStartAt.toISOString(),
        windowEndAt: windowEndAt.toISOString(),
        radiusKm,
      },
      matching: {
        supplierCandidatesScanned: allCandidates.length,
        targetedSupplierCount: targetedSuppliers.length,
        targetedSuppliers,
      },
      crisis: crisisMode,
      promptDispatch: pushResult,
      emergencyDispatch: emergencyPush,
    });
  } catch {
    return NextResponse.json({ error: "Unable to create receiver need request" }, { status: 500 });
  }
}
