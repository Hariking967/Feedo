import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { foodListing } from "@/db/schema";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { recipients } from "@/lib/platform/mock-data";

interface ReceiverProfile {
  userId: string;
  role: "receiver" | "ngo" | "recipient";
  displayName: string;
  lat: number;
  lng: number;
  capacity: number;
  requiredMeals: number;
  acceptedFoodCategories: string[];
  nutritionPreferences: string[];
  wantedItems: string[];
  maxTravelMinutes: number;
}

interface ListingCandidate {
  id: string;
  supplierUserId: string;
  supplierName: string;
  foodName: string;
  quantity: number;
  foodCategory: string;
  pickupAddress: string | null;
  pickupLat: number;
  pickupLng: number;
  spoilageScore: number;
  spoilageLabel: string;
  recommendedPickupWindowMinutes: number;
  priorityState: string;
  status: string;
  createdAt: string;
  cookedAt: string;
  emergencyExpiresAt: string | null;
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
  mode: "balanced" | "survival-first";
  source: Array<"weather" | "manual-zone" | "receiver-override">;
  weather: {
    condition: string;
    temperatureC: number;
    windSpeedMs: number;
    heavyRain: boolean;
    extremeHeat: boolean;
    storm: boolean;
  };
  manualZone: {
    active: boolean;
    zoneId: string | null;
    name: string | null;
  };
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

function parseTextArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
    .filter(Boolean);
}

async function loadReceiverProfile(userId: string, displayNameFallback: string): Promise<ReceiverProfile> {
  const defaultRecipient = recipients[0];
  const defaultCategories = ["veg", "non_veg", "dairy", "bakery", "rice", "seafood"];

  const fallback: ReceiverProfile = {
    userId,
    role: "recipient",
    displayName: displayNameFallback,
    lat: defaultRecipient?.location.lat ?? 12.9716,
    lng: defaultRecipient?.location.lng ?? 77.5946,
    capacity: defaultRecipient?.capacity ?? 40,
    requiredMeals: defaultRecipient?.capacity ?? 40,
    acceptedFoodCategories: defaultCategories,
    nutritionPreferences: defaultRecipient?.nutritionPreferences.map((item) => item.toLowerCase()) ?? [],
    wantedItems: [],
    maxTravelMinutes: 70,
  };

  if (!supabaseAdmin) return fallback;

  try {
    const { data, error } = await supabaseAdmin
      .from("responder_presence")
      .select("user_id, role, display_name, lat, lng, capacity, required_meals, accepted_food_categories, nutrition_preferences, wanted_items, max_travel_minutes")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) return fallback;

    const lat = Number(data.lat);
    const lng = Number(data.lng);
    const capacity = Math.max(1, Number(data.capacity ?? fallback.capacity));
    const requiredMeals = Math.max(1, Number(data.required_meals ?? capacity));
    const acceptedFoodCategories = parseTextArray(data.accepted_food_categories);

    return {
      userId,
      role: (data.role === "receiver" || data.role === "ngo" ? data.role : "recipient") as ReceiverProfile["role"],
      displayName: String(data.display_name ?? displayNameFallback),
      lat: Number.isFinite(lat) ? lat : fallback.lat,
      lng: Number.isFinite(lng) ? lng : fallback.lng,
      capacity,
      requiredMeals,
      acceptedFoodCategories: acceptedFoodCategories.length ? acceptedFoodCategories : defaultCategories,
      nutritionPreferences: parseTextArray(data.nutrition_preferences),
      wantedItems: parseTextArray(data.wanted_items),
      maxTravelMinutes: Math.max(20, Number(data.max_travel_minutes ?? 70)),
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
      .select("id, supplier_user_id, supplier_name, food_name, quantity, food_category, pickup_address, pickup_lat, pickup_lng, spoilage_score, spoilage_label, recommended_pickup_window_minutes, priority_state, status, created_at, cooked_at, emergency_expires_at")
      .in("status", ["active", "matched", "assigned", "partial"])
      .order("created_at", { ascending: false })
      .limit(200);

    if (error || !data) return null;

    return data
      .map((row) => {
        const pickupLat = Number(row.pickup_lat);
        const pickupLng = Number(row.pickup_lng);
        if (!row.id || !Number.isFinite(pickupLat) || !Number.isFinite(pickupLng)) {
          return null;
        }

        return {
          id: String(row.id),
          supplierUserId: String(row.supplier_user_id ?? ""),
          supplierName: String(row.supplier_name ?? "Supplier"),
          foodName: String(row.food_name ?? "Food listing"),
          quantity: Math.max(1, Number(row.quantity ?? 1)),
          foodCategory: String(row.food_category ?? "veg"),
          pickupAddress: row.pickup_address ? String(row.pickup_address) : null,
          pickupLat,
          pickupLng,
          spoilageScore: clamp(Number(row.spoilage_score ?? 0), 0, 100),
          spoilageLabel: String(row.spoilage_label ?? "Fresh"),
          recommendedPickupWindowMinutes: Math.max(20, Number(row.recommended_pickup_window_minutes ?? 60)),
          priorityState: String(row.priority_state ?? "passive"),
          status: String(row.status ?? "active"),
          createdAt: String(row.created_at ?? new Date().toISOString()),
          cookedAt: String(row.cooked_at ?? row.created_at ?? new Date().toISOString()),
          emergencyExpiresAt: row.emergency_expires_at ? String(row.emergency_expires_at) : null,
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
      supplierUserId: foodListing.supplierUserId,
      supplierName: foodListing.supplierName,
      foodName: foodListing.foodName,
      quantity: foodListing.quantity,
      foodCategory: foodListing.foodCategory,
      pickupAddress: foodListing.pickupAddress,
      pickupLat: foodListing.pickupLat,
      pickupLng: foodListing.pickupLng,
      spoilageScore: foodListing.spoilageScore,
      spoilageLabel: foodListing.spoilageLabel,
      recommendedPickupWindowMinutes: foodListing.recommendedPickupWindowMinutes,
      priorityState: foodListing.priorityState,
      status: foodListing.status,
      createdAt: foodListing.createdAt,
      cookedAt: foodListing.cookedAt,
      emergencyExpiresAt: foodListing.emergencyExpiresAt,
    })
    .from(foodListing)
    .orderBy(desc(foodListing.createdAt))
    .limit(200);

  return rows
    .filter((row) => ["active", "matched", "assigned", "partial"].includes(row.status))
    .map((row) => ({
      id: row.id,
      supplierUserId: row.supplierUserId,
      supplierName: row.supplierName,
      foodName: row.foodName,
      quantity: row.quantity,
      foodCategory: row.foodCategory,
      pickupAddress: row.pickupAddress,
      pickupLat: row.pickupLat,
      pickupLng: row.pickupLng,
      spoilageScore: clamp(row.spoilageScore, 0, 100),
      spoilageLabel: row.spoilageLabel,
      recommendedPickupWindowMinutes: row.recommendedPickupWindowMinutes,
      priorityState: row.priorityState,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      cookedAt: row.cookedAt.toISOString(),
      emergencyExpiresAt: row.emergencyExpiresAt ? row.emergencyExpiresAt.toISOString() : null,
    }));
}

async function estimateTravelDurations(
  profile: ReceiverProfile,
  listings: ListingCandidate[],
): Promise<{ durationMinutes: number; distanceKm: number }[]> {
  if (!listings.length) return [];

  const orsKey = process.env.OPENROUTESERVICE_API_KEY;

  if (orsKey) {
    try {
      const locations = [
        [profile.lng, profile.lat],
        ...listings.map((listing) => [listing.pickupLng, listing.pickupLat]),
      ];

      const response = await fetch("https://api.openrouteservice.org/v2/matrix/driving-car", {
        method: "POST",
        headers: {
          Authorization: orsKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          locations,
          metrics: ["distance", "duration"],
          units: "km",
          sources: [0],
          destinations: listings.map((_, index) => index + 1),
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as {
          distances?: number[][];
          durations?: number[][];
        };

        const distances = data.distances?.[0] ?? [];
        const durations = data.durations?.[0] ?? [];

        if (durations.length === listings.length) {
          return listings.map((_, index) => ({
            durationMinutes: Math.max(1, Math.round(Number(durations[index] ?? 0) / 60)),
            distanceKm: Math.max(0.1, Number((Number(distances[index] ?? 0)).toFixed(1))),
          }));
        }
      }
    } catch {
      // Fallback handled below.
    }
  }

  return listings.map((listing) => {
    const distanceKm = haversineKm(
      { lat: profile.lat, lng: profile.lng },
      { lat: listing.pickupLat, lng: listing.pickupLng },
    );

    return {
      distanceKm: Number(distanceKm.toFixed(1)),
      durationMinutes: Math.max(1, Math.round((distanceKm / 24) * 60)),
    };
  });
}

function computeTimeRemainingMinutes(listing: ListingCandidate, nowMs: number) {
  const emergencyMs = listing.emergencyExpiresAt ? new Date(listing.emergencyExpiresAt).getTime() : Number.NaN;
  if (Number.isFinite(emergencyMs)) {
    return Math.round((emergencyMs - nowMs) / 60000);
  }

  const cookedMs = new Date(listing.cookedAt).getTime();
  if (Number.isFinite(cookedMs)) {
    const expiryMs = cookedMs + listing.recommendedPickupWindowMinutes * 60_000;
    return Math.round((expiryMs - nowMs) / 60000);
  }

  const createdMs = new Date(listing.createdAt).getTime();
  const fallbackExpiryMs = createdMs + listing.recommendedPickupWindowMinutes * 60_000;
  return Math.round((fallbackExpiryMs - nowMs) / 60000);
}

async function detectCrisisSignal(profile: ReceiverProfile, forceOn: boolean): Promise<CrisisSignal> {
  const weatherKey = process.env.OPENWEATHER_API_KEY;

  let weatherCondition = "unknown";
  let temperatureC = 30;
  let windSpeedMs = 0;
  let heavyRain = false;
  let extremeHeat = false;
  let storm = false;

  if (weatherKey) {
    try {
      const weatherResponse = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${profile.lat}&lon=${profile.lng}&appid=${weatherKey}&units=metric`,
        { cache: "no-store" },
      );

      if (weatherResponse.ok) {
        const weatherJson = (await weatherResponse.json()) as {
          weather?: Array<{ main?: string }>;
          main?: { temp?: number };
          wind?: { speed?: number };
          rain?: { "1h"?: number; "3h"?: number };
        };

        weatherCondition = String(weatherJson.weather?.[0]?.main ?? "unknown").toLowerCase();
        temperatureC = Number(weatherJson.main?.temp ?? 30);
        windSpeedMs = Number(weatherJson.wind?.speed ?? 0);

        const rain1h = Number(weatherJson.rain?.["1h"] ?? 0);
        const rain3h = Number(weatherJson.rain?.["3h"] ?? 0);

        heavyRain = rain1h >= 6 || rain3h >= 15 || weatherCondition.includes("rain");
        extremeHeat = temperatureC >= 38;
        storm = weatherCondition.includes("storm") || windSpeedMs >= 13.9;
      }
    } catch {
      // Weather signals are best effort.
    }
  }

  let manualZoneActive = false;
  let manualZoneId: string | null = null;
  let manualZoneName: string | null = null;

  if (supabaseAdmin) {
    try {
      const { data } = await supabaseAdmin
        .from("crisis_zone")
        .select("id, name, center_lat, center_lng, radius_km, active")
        .eq("active", true)
        .limit(50);

      for (const row of data ?? []) {
        const centerLat = Number((row as { center_lat?: number }).center_lat);
        const centerLng = Number((row as { center_lng?: number }).center_lng);
        const radiusKm = Number((row as { radius_km?: number }).radius_km ?? 0);
        if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng) || !Number.isFinite(radiusKm)) {
          continue;
        }

        const distanceKm = haversineKm({ lat: profile.lat, lng: profile.lng }, { lat: centerLat, lng: centerLng });
        if (distanceKm <= radiusKm) {
          manualZoneActive = true;
          manualZoneId = String((row as { id?: string }).id ?? "");
          manualZoneName = String((row as { name?: string }).name ?? "Crisis zone");
          break;
        }
      }
    } catch {
      // Manual zone table may not exist in all environments.
    }
  }

  const weatherActive = heavyRain || extremeHeat || storm;
  const active = forceOn || weatherActive || manualZoneActive;

  const source: Array<"weather" | "manual-zone" | "receiver-override"> = [];
  if (forceOn) source.push("receiver-override");
  if (weatherActive) source.push("weather");
  if (manualZoneActive) source.push("manual-zone");

  const severity: CrisisSignal["severity"] =
    (manualZoneActive && (storm || extremeHeat)) || (storm && heavyRain)
      ? "critical"
      : active
        ? "elevated"
        : "normal";

  const reason = forceOn
    ? "Receiver manually enabled crisis mode"
    : active
      ? manualZoneActive
        ? `${manualZoneName ?? "Manual crisis zone"} is active`
        : "Severe weather conditions detected near receiver"
      : "Normal operating conditions";

  return {
    active,
    severity,
    reason,
    mode: active ? "survival-first" : "balanced",
    source,
    weather: {
      condition: weatherCondition,
      temperatureC: Number.isFinite(temperatureC) ? Number(temperatureC.toFixed(1)) : 30,
      windSpeedMs: Number.isFinite(windSpeedMs) ? Number(windSpeedMs.toFixed(1)) : 0,
      heavyRain,
      extremeHeat,
      storm,
    },
    manualZone: {
      active: manualZoneActive,
      zoneId: manualZoneId,
      name: manualZoneName,
    },
  };
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

    const forceCrisis = request.nextUrl.searchParams.get("crisisOverride") === "force_on";

    const profile = await loadReceiverProfile(requestUser.userId, requestUser.userName);
    const listings = (await loadListingsFromSupabase()) ?? (await loadListingsFromDb());

    if (!listings.length) {
      return NextResponse.json({
        source: "none",
        profile,
        rankedFeed: [],
      });
    }

    const [travel, crisis] = await Promise.all([
      estimateTravelDurations(profile, listings),
      detectCrisisSignal(profile, forceCrisis),
    ]);
    const nowMs = Date.now();

    const rankedFeed = listings
      .map((listing, index) => {
        const travelInfo = travel[index] ?? { durationMinutes: 999, distanceKm: 999 };
        const remainingMinutes = computeTimeRemainingMinutes(listing, nowMs);

        const quantityCoverage = clamp(listing.quantity / Math.max(1, profile.requiredMeals), 0, 1.4);
        const oversupplyPenalty = quantityCoverage > 1 ? clamp((quantityCoverage - 1) * 0.18, 0, 0.15) : 0;
        const quantityScore = clamp((quantityCoverage >= 0.55 ? quantityCoverage + 0.12 : quantityCoverage) - oversupplyPenalty, 0, 1);

        const acceptsCategory = profile.acceptedFoodCategories.includes(listing.foodCategory.toLowerCase());
        const nutritionMatch = profile.nutritionPreferences.some((preference) => {
          const token = preference.toLowerCase();
          return listing.foodName.toLowerCase().includes(token) || listing.foodCategory.toLowerCase().includes(token);
        });
        const baseSuitability = acceptsCategory ? 0.72 : 0.18;

        const wantedMatch = profile.wantedItems.some((item) => {
          const target = item.toLowerCase();
          return listing.foodName.toLowerCase().includes(target) || listing.foodCategory.toLowerCase().includes(target);
        });

        const suitabilityScore = clamp(baseSuitability + (wantedMatch ? 0.18 : 0) + (nutritionMatch ? 0.1 : 0), 0, 1);
        const freshnessScore = clamp(1 - listing.spoilageScore / 100, 0, 1);
        const urgencyScore = clamp((listing.spoilageScore / 100) * 0.55 + clamp(1 - remainingMinutes / 180, 0, 1) * 0.45, 0, 1);
        const travelScore = clamp(1 - travelInfo.durationMinutes / profile.maxTravelMinutes, 0, 1);
        const timingFeasibilityScore = clamp(
          remainingMinutes <= 0
            ? 0
            : 1 - Math.max(0, travelInfo.durationMinutes - remainingMinutes) / Math.max(remainingMinutes, 15),
          0,
          1,
        );

        const isFeasible = remainingMinutes > 0 && travelInfo.durationMinutes <= Math.max(remainingMinutes, 10);

        let composite =
          quantityScore * 0.28 +
          suitabilityScore * 0.22 +
          freshnessScore * 0.14 +
          urgencyScore * 0.16 +
          travelScore * 0.14 +
          timingFeasibilityScore * 0.06;

        if (crisis.active) {
          composite =
            urgencyScore * 0.33 +
            travelScore * 0.26 +
            timingFeasibilityScore * 0.2 +
            suitabilityScore * 0.11 +
            quantityScore * 0.1;
        }

        if (listing.priorityState.includes("urgent") && travelInfo.durationMinutes <= 35) {
          composite += crisis.active ? 0.09 : 0.06;
        }

        if (wantedMatch) {
          composite += 0.04;
        }

        if (crisis.active && travelInfo.distanceKm <= 4) {
          composite += 0.06;
        }

        if (!acceptsCategory) {
          composite -= crisis.active ? 0.08 : 0.16;
        }

        if (!isFeasible) {
          composite -= crisis.active ? 0.38 : 0.22;
        }

        if (remainingMinutes <= 0) {
          composite -= 0.4;
        }

        const matchScore = Math.round(clamp(composite, 0, 1) * 100);

        return {
          rankScore: matchScore,
          listingId: listing.id,
          supplierUserId: listing.supplierUserId,
          supplierName: listing.supplierName,
          foodName: listing.foodName,
          quantity: listing.quantity,
          foodCategory: listing.foodCategory,
          pickupAddress: listing.pickupAddress,
          pickupLat: listing.pickupLat,
          pickupLng: listing.pickupLng,
          spoilageScore: listing.spoilageScore,
          spoilageLabel: listing.spoilageLabel,
          recommendedPickupWindowMinutes: listing.recommendedPickupWindowMinutes,
          timeRemainingMinutes: remainingMinutes,
          routeDurationMinutes: travelInfo.durationMinutes,
          routeDistanceKm: travelInfo.distanceKm,
          priorityState: listing.priorityState,
          status: listing.status,
          isFeasible,
          reasons: {
            quantityScore: Math.round(quantityScore * 100),
            suitabilityScore: Math.round(suitabilityScore * 100),
            freshnessScore: Math.round(freshnessScore * 100),
            urgencyScore: Math.round(urgencyScore * 100),
            travelScore: Math.round(travelScore * 100),
            wantedMatch,
            acceptsCategory,
            crisisMode: crisis.mode,
          },
        };
      })
      .sort((a, b) => b.rankScore - a.rankScore)
      .slice(0, 60)
      .map((entry, index) => ({
        ...entry,
        rank: index + 1,
      }));

    return NextResponse.json({
      source: supabaseAdmin ? "supabase+matching" : "database+matching",
      authMode: requestUser.source,
      rankingMode: crisis.mode,
      scoreVersion: "v2.1",
      crisis,
      profile,
      rankedFeed,
    });
  } catch {
    return NextResponse.json({ error: "Unable to build ranked receiver feed" }, { status: 500 });
  }
}
