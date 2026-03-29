import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  calculateSpoilageRisk,
  estimateTravelTime,
  getWeatherSnapshot,
  type FoodCategory,
  type PackagingCondition,
  type StorageCondition,
} from "@/lib/spoilage-risk";

const payloadSchema = z.object({
  foodCategory: z.enum(["veg", "non_veg", "dairy", "bakery", "rice", "seafood"]),
  cookedAt: z.string(),
  packagingCondition: z.enum(["sealed", "good", "average", "damaged"]),
  storageCondition: z.enum(["refrigerated", "insulated", "room_temp", "outdoor"]),
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
});

const defaultDestination = { lat: 12.9716, lng: 77.5946 };

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

    return NextResponse.json({
      score: risk.score,
      label: risk.label,
      recommendedPickupWindowMinutes: risk.recommendedPickupWindowMinutes,
      reasons: risk.reasons,
      weather,
      travel,
    });
  } catch {
    return NextResponse.json({ error: "Unable to evaluate spoilage risk" }, { status: 500 });
  }
}
