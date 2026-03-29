import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
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

const CRON_SECRET_HEADER = "x-risk-recalc-secret";

export async function POST(request: NextRequest) {
  try {
    const secret = request.headers.get(CRON_SECRET_HEADER);
    const systemSecret = process.env.RISK_RECALC_SECRET;
    const isCronRequest = Boolean(systemSecret && secret && secret === systemSecret);

    const session = await auth.api.getSession({ headers: request.headers });
    if (!isCronRequest && !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = (await request.json().catch(() => null)) as { listingId?: string } | null;
    const listingId = payload?.listingId?.trim() || null;

    const whereClause = isCronRequest
      ? listingId
        ? and(eq(foodListing.id, listingId), eq(foodListing.status, "active"))
        : eq(foodListing.status, "active")
      : listingId
        ? and(
            eq(foodListing.id, listingId),
            eq(foodListing.supplierUserId, session!.user.id),
            eq(foodListing.status, "active"),
          )
        : and(eq(foodListing.supplierUserId, session!.user.id), eq(foodListing.status, "active"));

    const rows = await db.select().from(foodListing).where(whereClause).limit(isCronRequest ? 150 : 40);

    let updated = 0;

    for (const row of rows) {
      const pickup = { lat: row.pickupLat, lng: row.pickupLng };
      const destination = {
        lat: row.deliveryLat ?? 12.9716,
        lng: row.deliveryLng ?? 77.5946,
      };

      const [weather, travel] = await Promise.all([
        getWeatherSnapshot(pickup.lat, pickup.lng),
        estimateTravelTime(pickup, destination),
      ]);

      const risk = calculateSpoilageRisk({
        foodCategory: row.foodCategory as FoodCategory,
        cookedAt: row.cookedAt,
        packagingCondition: row.packagingCondition as PackagingCondition,
        storageCondition: row.storageCondition as StorageCondition,
        weather,
        travel,
      });

      const now = new Date();

      await db
        .update(foodListing)
        .set({
          routeDurationMinutes: travel.durationMinutes,
          routeDistanceKm: travel.distanceKm,
          weatherTempC: weather.temperatureC,
          weatherHumidityPct: Math.round(weather.humidityPct),
          spoilageScore: risk.score,
          spoilageLabel: risk.label,
          recommendedPickupWindowMinutes: risk.recommendedPickupWindowMinutes,
          updatedAt: now,
          lastRiskCalculatedAt: now,
          status: risk.score >= 92 ? "expired" : row.status,
        })
        .where(eq(foodListing.id, row.id));

      if (supabaseAdmin) {
        try {
          await supabaseAdmin
            .from("food_listing")
            .update({
              route_duration_minutes: travel.durationMinutes,
              route_distance_km: travel.distanceKm,
              weather_temp_c: weather.temperatureC,
              weather_humidity_pct: Math.round(weather.humidityPct),
              spoilage_score: risk.score,
              spoilage_label: risk.label,
              recommended_pickup_window_minutes: risk.recommendedPickupWindowMinutes,
              status: risk.score >= 92 ? "expired" : row.status,
              updated_at: now.toISOString(),
              last_risk_calculated_at: now.toISOString(),
            })
            .eq("id", row.id);
        } catch {
          // Supabase mirror is optional.
        }
      }

      updated += 1;
    }

    return NextResponse.json({ updated });
  } catch {
    return NextResponse.json({ error: "Unable to recalculate risk" }, { status: 500 });
  }
}
