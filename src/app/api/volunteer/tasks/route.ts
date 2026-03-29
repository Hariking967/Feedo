import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { foodListing } from "@/db/schema";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

interface RequestUser {
  userId: string;
  userName: string;
  source: "session" | "header-fallback";
}

type TransportMode = "bike" | "scooter" | "van" | "truck";

interface VolunteerProfile {
  userId: string;
  displayName: string;
  transportMode: TransportMode;
  carryingCapacityKg: number;
  active: boolean;
  location: { lat: number; lng: number };
  preferredZones: string[];
}

interface ListingCandidate {
  id: string;
  foodName: string;
  supplierName: string;
  quantity: number;
  pickupLat: number;
  pickupLng: number;
  pickupAddress: string | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
  spoilageScore: number;
  recommendedPickupWindowMinutes: number;
  routeDurationMinutes: number;
  routeDistanceKm: number;
  isEmergency: boolean;
  priorityState: string;
  createdAt: string;
}

interface WeatherAdvisory {
  condition: string;
  temperatureC: number;
  windSpeedMs: number;
  rainMm1h: number;
  severity: "normal" | "elevated" | "critical";
  advisory: string;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
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

async function resolveRequestUser(request: NextRequest): Promise<RequestUser | null> {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (session?.user?.id) {
      return {
        userId: session.user.id,
        userName: session.user.name ?? "Volunteer",
        source: "session",
      };
    }
  } catch {
    // Fall through to header-based identity when auth lookup is unavailable.
  }

  const headerUserId = request.headers.get("x-feedo-user-id")?.trim() ?? "";
  if (!headerUserId) return null;

  return {
    userId: headerUserId,
    userName: request.headers.get("x-feedo-user-name")?.trim() || "Volunteer",
    source: "header-fallback",
  };
}

function transportCapacityKg(mode: TransportMode) {
  if (mode === "bike") return 18;
  if (mode === "scooter") return 32;
  if (mode === "truck") return 260;
  return 110;
}

function orsProfileForMode(mode: TransportMode) {
  if (mode === "bike") return "cycling-regular";
  if (mode === "truck") return "driving-hgv";
  return "driving-car";
}

function fallbackKmPerHourForMode(mode: TransportMode) {
  if (mode === "bike") return 14;
  if (mode === "scooter") return 24;
  if (mode === "truck") return 20;
  return 28;
}

function parsePreferredZones(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean)
    .slice(0, 12);
}

async function loadVolunteerProfile(user: RequestUser, request: NextRequest): Promise<VolunteerProfile> {
  const latOverride = Number(request.nextUrl.searchParams.get("lat"));
  const lngOverride = Number(request.nextUrl.searchParams.get("lng"));

  const fallback: VolunteerProfile = {
    userId: user.userId,
    displayName: user.userName,
    transportMode: "bike",
    carryingCapacityKg: 18,
    active: true,
    location: {
      lat: Number.isFinite(latOverride) ? latOverride : 12.9716,
      lng: Number.isFinite(lngOverride) ? lngOverride : 77.5946,
    },
    preferredZones: [],
  };

  if (!supabaseAdmin) return fallback;

  try {
    const [{ data: presence }, { data: profile }] = await Promise.all([
      supabaseAdmin
        .from("responder_presence")
        .select("display_name, lat, lng, active, capacity")
        .eq("user_id", user.userId)
        .maybeSingle(),
      supabaseAdmin
        .from("volunteer_profile")
        .select("transport_mode, carrying_capacity_kg, preferred_zones, active")
        .eq("user_id", user.userId)
        .maybeSingle(),
    ]);

    const transportModeRaw = String((profile as { transport_mode?: string } | null)?.transport_mode ?? "").toLowerCase();
    const transportMode: TransportMode =
      transportModeRaw === "bike" || transportModeRaw === "scooter" || transportModeRaw === "van" || transportModeRaw === "truck"
        ? (transportModeRaw as TransportMode)
        : fallback.transportMode;

    const carryingCapacityKg = Math.max(
      5,
      Number((profile as { carrying_capacity_kg?: number } | null)?.carrying_capacity_kg ?? (presence as { capacity?: number } | null)?.capacity ?? transportCapacityKg(transportMode)),
    );

    return {
      userId: user.userId,
      displayName: String((presence as { display_name?: string } | null)?.display_name ?? user.userName),
      transportMode,
      carryingCapacityKg,
      active: Boolean((profile as { active?: boolean } | null)?.active ?? (presence as { active?: boolean } | null)?.active ?? true),
      location: {
        lat: Number.isFinite(latOverride)
          ? latOverride
          : Number((presence as { lat?: number } | null)?.lat ?? fallback.location.lat),
        lng: Number.isFinite(lngOverride)
          ? lngOverride
          : Number((presence as { lng?: number } | null)?.lng ?? fallback.location.lng),
      },
      preferredZones: parsePreferredZones((profile as { preferred_zones?: unknown } | null)?.preferred_zones),
    };
  } catch {
    return fallback;
  }
}

async function loadListingsFromSupabase(): Promise<ListingCandidate[] | null> {
  if (!supabaseAdmin) return null;

  try {
    const { data, error } = await supabaseAdmin
      .from("food_listing")
      .select("id, food_name, supplier_name, quantity, pickup_lat, pickup_lng, pickup_address, delivery_lat, delivery_lng, spoilage_score, recommended_pickup_window_minutes, route_duration_minutes, route_distance_km, is_emergency, priority_state, created_at, status")
      .in("status", ["active", "matched", "assigned", "partial"])
      .order("created_at", { ascending: false })
      .limit(120);

    if (error || !data) return null;

    return data
      .map((row) => {
        const pickupLat = Number(row.pickup_lat);
        const pickupLng = Number(row.pickup_lng);
        if (!row.id || !Number.isFinite(pickupLat) || !Number.isFinite(pickupLng)) return null;

        return {
          id: String(row.id),
          foodName: String(row.food_name ?? "Food listing"),
          supplierName: String(row.supplier_name ?? "Supplier"),
          quantity: Math.max(1, Number(row.quantity ?? 1)),
          pickupLat,
          pickupLng,
          pickupAddress: row.pickup_address ? String(row.pickup_address) : null,
          deliveryLat: Number.isFinite(Number(row.delivery_lat)) ? Number(row.delivery_lat) : null,
          deliveryLng: Number.isFinite(Number(row.delivery_lng)) ? Number(row.delivery_lng) : null,
          spoilageScore: clamp(Number(row.spoilage_score ?? 0), 0, 100),
          recommendedPickupWindowMinutes: Math.max(20, Number(row.recommended_pickup_window_minutes ?? 60)),
          routeDurationMinutes: Math.max(1, Number(row.route_duration_minutes ?? 20)),
          routeDistanceKm: Math.max(0.1, Number(row.route_distance_km ?? 1)),
          isEmergency: Boolean(row.is_emergency),
          priorityState: String(row.priority_state ?? "passive"),
          createdAt: String(row.created_at ?? new Date().toISOString()),
        } satisfies ListingCandidate;
      })
      .filter((item): item is ListingCandidate => Boolean(item));
  } catch {
    return null;
  }
}

async function loadListingsFromDb(): Promise<ListingCandidate[]> {
  const rows = await db
    .select({
      id: foodListing.id,
      foodName: foodListing.foodName,
      supplierName: foodListing.supplierName,
      quantity: foodListing.quantity,
      pickupLat: foodListing.pickupLat,
      pickupLng: foodListing.pickupLng,
      pickupAddress: foodListing.pickupAddress,
      deliveryLat: foodListing.deliveryLat,
      deliveryLng: foodListing.deliveryLng,
      spoilageScore: foodListing.spoilageScore,
      recommendedPickupWindowMinutes: foodListing.recommendedPickupWindowMinutes,
      routeDurationMinutes: foodListing.routeDurationMinutes,
      routeDistanceKm: foodListing.routeDistanceKm,
      isEmergency: foodListing.isEmergency,
      priorityState: foodListing.priorityState,
      createdAt: foodListing.createdAt,
      status: foodListing.status,
    })
    .from(foodListing)
    .orderBy(desc(foodListing.createdAt))
    .limit(120);

  return rows
    .filter((row) => ["active", "matched", "assigned", "partial"].includes(row.status))
    .map((row) => ({
      id: row.id,
      foodName: row.foodName,
      supplierName: row.supplierName,
      quantity: row.quantity,
      pickupLat: row.pickupLat,
      pickupLng: row.pickupLng,
      pickupAddress: row.pickupAddress,
      deliveryLat: row.deliveryLat,
      deliveryLng: row.deliveryLng,
      spoilageScore: clamp(row.spoilageScore, 0, 100),
      recommendedPickupWindowMinutes: row.recommendedPickupWindowMinutes,
      routeDurationMinutes: row.routeDurationMinutes,
      routeDistanceKm: row.routeDistanceKm,
      isEmergency: row.isEmergency,
      priorityState: row.priorityState,
      createdAt: row.createdAt.toISOString(),
    }));
}

async function estimateVolunteerToPickup(profile: VolunteerProfile, listings: ListingCandidate[]) {
  if (!listings.length) return [] as Array<{ durationMinutes: number; distanceKm: number }>;

  const orsKey = process.env.OPENROUTESERVICE_API_KEY;

  if (orsKey) {
    try {
      const locations = [[profile.location.lng, profile.location.lat], ...listings.map((listing) => [listing.pickupLng, listing.pickupLat])];
      const matrixProfile = orsProfileForMode(profile.transportMode);

      const response = await fetch(`https://api.openrouteservice.org/v2/matrix/${matrixProfile}`, {
        method: "POST",
        headers: {
          Authorization: orsKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          locations,
          metrics: ["distance", "duration"],
          sources: [0],
          destinations: listings.map((_, index) => index + 1),
        }),
      });

      if (response.ok) {
        const json = (await response.json()) as { distances?: number[][]; durations?: number[][] };
        const distanceRow = json.distances?.[0] ?? [];
        const durationRow = json.durations?.[0] ?? [];

        if (durationRow.length === listings.length) {
          return listings.map((_, index) => ({
            distanceKm: Math.max(0.1, Number((Number(distanceRow[index] ?? 0) / 1000).toFixed(1))),
            durationMinutes: Math.max(1, Math.round(Number(durationRow[index] ?? 0) / 60)),
          }));
        }
      }
    } catch {
      // Fall through to local estimate.
    }
  }

  return listings.map((listing) => {
    const distanceKm = haversineKm(profile.location, { lat: listing.pickupLat, lng: listing.pickupLng });
    const speedKmPerHour = fallbackKmPerHourForMode(profile.transportMode);
    return {
      distanceKm: Number(distanceKm.toFixed(1)),
      durationMinutes: Math.max(1, Math.round((distanceKm / speedKmPerHour) * 60)),
    };
  });
}

async function fetchWeatherAdvisory(location: { lat: number; lng: number }): Promise<WeatherAdvisory> {
  const key = process.env.OPENWEATHER_API_KEY;

  if (!key) {
    return {
      condition: "unknown",
      temperatureC: 30,
      windSpeedMs: 0,
      rainMm1h: 0,
      severity: "normal",
      advisory: "Weather feed unavailable; using normal routing assumptions.",
    };
  }

  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${location.lat}&lon=${location.lng}&appid=${key}&units=metric`,
      { cache: "no-store" },
    );

    if (!response.ok) {
      throw new Error("weather unavailable");
    }

    const json = (await response.json()) as {
      weather?: Array<{ main?: string }>;
      main?: { temp?: number };
      wind?: { speed?: number };
      rain?: { "1h"?: number };
    };

    const condition = String(json.weather?.[0]?.main ?? "unknown").toLowerCase();
    const temperatureC = Number(json.main?.temp ?? 30);
    const windSpeedMs = Number(json.wind?.speed ?? 0);
    const rainMm1h = Number(json.rain?.["1h"] ?? 0);

    const storm = condition.includes("storm") || windSpeedMs >= 13.9;
    const heavyRain = rainMm1h >= 6 || condition.includes("rain");
    const extremeHeat = temperatureC >= 38;

    const severity: WeatherAdvisory["severity"] = storm ? "critical" : heavyRain || extremeHeat ? "elevated" : "normal";

    const advisory = storm
      ? "Storm advisory: prioritize shortest safe routes and avoid low-visibility stretches."
      : heavyRain
        ? "Heavy rain advisory: expect delays; avoid long multi-stop chains."
        : extremeHeat
          ? "Heat advisory: prioritize high-spoilage pickups with the fastest completion path."
          : "Weather stable: normal routing priorities apply.";

    return {
      condition,
      temperatureC: Number.isFinite(temperatureC) ? Number(temperatureC.toFixed(1)) : 30,
      windSpeedMs: Number.isFinite(windSpeedMs) ? Number(windSpeedMs.toFixed(1)) : 0,
      rainMm1h: Number.isFinite(rainMm1h) ? Number(rainMm1h.toFixed(1)) : 0,
      severity,
      advisory,
    };
  } catch {
    return {
      condition: "unknown",
      temperatureC: 30,
      windSpeedMs: 0,
      rainMm1h: 0,
      severity: "normal",
      advisory: "Weather feed unavailable; using normal routing assumptions.",
    };
  }
}

function nearestNeighborStopOrder(
  volunteerLocation: { lat: number; lng: number },
  stops: Array<{ listingId: string; lat: number; lng: number; supplierName: string; quantity: number; spoilageScore: number }>,
) {
  const remaining = [...stops];
  const ordered: typeof stops = [];
  let current = volunteerLocation;

  while (remaining.length) {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < remaining.length; i += 1) {
      const candidate = remaining[i];
      const distance = haversineKm(current, { lat: candidate.lat, lng: candidate.lng });
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }

    const [selected] = remaining.splice(bestIndex, 1);
    ordered.push(selected);
    current = { lat: selected.lat, lng: selected.lng };
  }

  return ordered;
}

function buildPooledTasks(profile: VolunteerProfile, tasks: Array<{
  taskId: string;
  listingId: string;
  title: string;
  supplierName: string;
  pickupAddress: string | null;
  pickupLat: number;
  pickupLng: number;
  quantity: number;
  route: { volunteerToPickupMinutes: number; volunteerToPickupKm: number; pickupToReceiverMinutes: number; pickupToReceiverKm: number; totalMinutes: number };
  urgency: { emergency: boolean; remainingWindowMinutes: number; spoilageScore: number };
  score: number;
}>) {
  const maxStops = profile.transportMode === "bike" ? 2 : profile.transportMode === "scooter" ? 3 : 4;
  const maxTotalLoad = Math.max(8, Math.round(profile.carryingCapacityKg * 0.9));
  const poolCandidates = tasks
    .filter((task) => task.quantity <= Math.max(35, Math.round(profile.carryingCapacityKg * 0.6)))
    .slice(0, 10);

  const pooled: Array<{
    pooledTaskId: string;
    title: string;
    score: number;
    totalQuantity: number;
    estimatedTotalMinutes: number;
    stopOrder: Array<{ listingId: string; supplierName: string; quantity: number; stopNumber: number }>;
    subStages: string[];
  }> = [];

  if (poolCandidates.length < 2) return pooled;

  let cursor = 0;
  while (cursor < poolCandidates.length - 1 && pooled.length < 2) {
    const seed = poolCandidates[cursor];
    const group = [seed];
    let totalQuantity = seed.quantity;

    for (let i = cursor + 1; i < poolCandidates.length && group.length < maxStops; i += 1) {
      const candidate = poolCandidates[i];
      if (totalQuantity + candidate.quantity > maxTotalLoad) continue;
      const distance = Math.abs(candidate.route.volunteerToPickupKm - seed.route.volunteerToPickupKm);
      if (distance > 2.8) continue;
      group.push(candidate);
      totalQuantity += candidate.quantity;
    }

    if (group.length >= 2) {
      const orderedStops = nearestNeighborStopOrder(
        profile.location,
        group.map((task) => ({
          listingId: task.listingId,
          lat: task.pickupLat,
          lng: task.pickupLng,
          supplierName: task.supplierName,
          quantity: task.quantity,
          spoilageScore: task.urgency.spoilageScore,
        })),
      );

      const stopOrder = orderedStops.map((stop, index) => {
        const original = group.find((item) => item.listingId === stop.listingId)!;
        return {
          listingId: original.listingId,
          supplierName: original.supplierName,
          quantity: original.quantity,
          stopNumber: index + 1,
        };
      });

      const estimatedTotalMinutes = Math.round(group.reduce((sum, item) => sum + item.route.totalMinutes, 0) * 0.72);
      const pooledScore = Math.round(
        clamp(
          group.reduce((sum, item) => sum + item.score, 0) / group.length + Math.min(12, group.length * 4),
          0,
          100,
        ),
      );

      pooled.push({
        pooledTaskId: `pool-${group.map((item) => item.listingId).join("-")}`,
        title: `${group.length}-stop pooled rescue`,
        score: pooledScore,
        totalQuantity,
        estimatedTotalMinutes,
        stopOrder,
        subStages: [
          ...stopOrder.map((stop) => `pickup_${stop.stopNumber}_${stop.listingId}`),
          "final_drop",
        ],
      });
    }

    cursor += 1;
  }

  return pooled;
}

export async function GET(request: NextRequest) {
  try {
    const requestUser = await resolveRequestUser(request);
    if (!requestUser?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await loadVolunteerProfile(requestUser, request);
    const listings = (await loadListingsFromSupabase()) ?? (await loadListingsFromDb());

    if (!listings.length) {
      return NextResponse.json({
        source: "none",
        authMode: requestUser.source,
        profile,
        tasks: [],
      });
    }

    const [travelToPickup, weather] = await Promise.all([
      estimateVolunteerToPickup(profile, listings),
      fetchWeatherAdvisory(profile.location),
    ]);
    const capacity = Math.max(5, profile.carryingCapacityKg || transportCapacityKg(profile.transportMode));

    const tasks = listings
      .map((listing, index) => {
        const travel = travelToPickup[index] ?? { distanceKm: 999, durationMinutes: 999 };
        const totalDuration = travel.durationMinutes + Math.max(1, listing.routeDurationMinutes);

        const remainingWindow = listing.recommendedPickupWindowMinutes;
        const feasibilityScore = clamp(1 - totalDuration / Math.max(remainingWindow, 25), 0, 1);

        const loadRatio = listing.quantity / capacity;
        const loadScore = loadRatio <= 1 ? clamp(1 - Math.abs(loadRatio - 0.65), 0, 1) : clamp(1 - (loadRatio - 1), 0, 1);

        const distanceScore = clamp(1 - travel.distanceKm / 18, 0, 1);
        const urgencyBase = listing.isEmergency || listing.priorityState.includes("urgent") ? 1 : clamp(1 - remainingWindow / 180, 0, 1);
        const spoilageSensitivity = clamp(listing.spoilageScore / 100, 0, 1);
        const impactScore = clamp(listing.quantity / 120, 0, 1);

        let composite =
          urgencyBase * 0.28 +
          feasibilityScore * 0.22 +
          loadScore * 0.18 +
          distanceScore * 0.14 +
          spoilageSensitivity * 0.10 +
          impactScore * 0.08;

        if (weather.severity !== "normal") {
          const hotBoost = weather.temperatureC >= 36 ? spoilageSensitivity * 0.1 : 0;
          const rainPenalty = weather.rainMm1h >= 4 ? Math.min(0.12, travel.distanceKm / 120) : 0;
          const stormPenalty = weather.severity === "critical" ? Math.min(0.18, totalDuration / 240) : 0;
          composite = composite + hotBoost - rainPenalty - stormPenalty;
        }

        const tooHeavyForVehicle = profile.transportMode === "bike" && listing.quantity > capacity;
        if (tooHeavyForVehicle) composite -= 0.25;
        if (totalDuration > remainingWindow) composite -= 0.15;

        const score = Math.round(clamp(composite, 0, 1) * 100);

        return {
          taskId: `vt-${listing.id}`,
          listingId: listing.id,
          title: listing.foodName,
          supplierName: listing.supplierName,
          pickupAddress: listing.pickupAddress,
          pickupLat: listing.pickupLat,
          pickupLng: listing.pickupLng,
          quantity: listing.quantity,
          transportMode: profile.transportMode,
          carryingCapacityKg: capacity,
          route: {
            volunteerToPickupMinutes: travel.durationMinutes,
            volunteerToPickupKm: travel.distanceKm,
            pickupToReceiverMinutes: listing.routeDurationMinutes,
            pickupToReceiverKm: listing.routeDistanceKm,
            totalMinutes: totalDuration,
          },
          urgency: {
            emergency: listing.isEmergency || listing.priorityState.includes("urgent"),
            remainingWindowMinutes: remainingWindow,
            spoilageScore: listing.spoilageScore,
          },
          weather,
          score,
          reasons: {
            urgency: Math.round(urgencyBase * 100),
            feasibility: Math.round(feasibilityScore * 100),
            loadFit: Math.round(loadScore * 100),
            distance: Math.round(distanceScore * 100),
            spoilageSensitivity: Math.round(spoilageSensitivity * 100),
            expectedImpact: Math.round(impactScore * 100),
            tooHeavyForVehicle,
          },
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 25)
      .map((task, index) => ({ ...task, rank: index + 1 }));

    const pooledTasks = buildPooledTasks(profile, tasks);

    return NextResponse.json({
      source: supabaseAdmin ? "supabase+ors" : "database+fallback",
      authMode: requestUser.source,
      profile,
      weather,
      pooledTasks,
      tasks,
    });
  } catch {
    return NextResponse.json({ error: "Unable to build volunteer task feed" }, { status: 500 });
  }
}
