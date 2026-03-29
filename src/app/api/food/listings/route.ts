import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { foodListing } from "@/db/schema";
import { auth } from "@/lib/auth";
import {
  calculateSpoilageRisk,
  estimateTravelTime,
  getWeatherSnapshot,
  type FoodCategory,
  type PackagingCondition,
  type StorageCondition,
} from "@/lib/spoilage-risk";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { appendLifecycleEvent } from "@/lib/lifecycle-events";

const listingSchema = z.object({
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
});

const defaultDestination = { lat: 12.9716, lng: 77.5946 };

async function mirrorToSupabase(record: {
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

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const status = request.nextUrl.searchParams.get("status") ?? "active";

    const rows = await db
      .select()
      .from(foodListing)
      .where(and(eq(foodListing.supplierUserId, session.user.id), eq(foodListing.status, status)))
      .orderBy(desc(foodListing.createdAt))
      .limit(30);

    return NextResponse.json({ listings: rows });
  } catch {
    return NextResponse.json({ error: "Unable to fetch food listings" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as unknown;
    const parsed = listingSchema.safeParse(body);

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

    const now = new Date();
    const listingId = `fl-${crypto.randomUUID()}`;

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
      recommendedPickupWindowMinutes: risk.recommendedPickupWindowMinutes,
      isEmergency: false,
      priorityLevel: "normal",
      priorityState: "passive",
      expectedResponseMinutes: null,
      assignedVolunteerId: null,
      assignedReceiverId: null,
      emergencyActivatedAt: null,
      emergencyExpiresAt: null,
      lastDispatchAt: null,
      status: "active",
      createdAt: now,
      updatedAt: now,
      lastRiskCalculatedAt: now,
    });

    const [saved] = await db.select().from(foodListing).where(eq(foodListing.id, listingId)).limit(1);

    if (saved) {
      await mirrorToSupabase({
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
        // Supabase mirror is optional.
      });

      await appendLifecycleEvent({
        listingId: saved.id,
        supplierUserId: saved.supplierUserId,
        actorUserId: session.user.id,
        actorRole: "supplier",
        eventType: "listing_created",
        statusAfter: saved.status,
        payload: {
          quantity: saved.quantity,
          foodCategory: saved.foodCategory,
          spoilageScore: saved.spoilageScore,
          pickupAddress: saved.pickupAddress,
        },
      });
    }

    return NextResponse.json({
      listing: saved,
      risk: {
        score: risk.score,
        label: risk.label,
        recommendedPickupWindowMinutes: risk.recommendedPickupWindowMinutes,
        reasons: risk.reasons,
      },
    });
  } catch {
    return NextResponse.json({ error: "Unable to create food listing" }, { status: 500 });
  }
}
