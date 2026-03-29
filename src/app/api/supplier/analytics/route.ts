import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { foodListing, supplierProof } from "@/db/schema";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

type ListingSnapshot = {
  id: string;
  food_name: string;
  quantity: number;
  food_category: string;
  pickup_address: string | null;
  status: string;
  expected_response_minutes: number | null;
  route_duration_minutes: number;
  created_at: string;
};

const VALID_CATEGORIES = new Set(["veg", "non_veg", "dairy", "bakery", "rice", "seafood"]);

const WEIGHT_KG_PER_MEAL = 0.45;
const CO2_KG_PER_KG_FOOD = 2.5;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]) {
  if (!values.length) return null;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function toPercentage(value: number) {
  return Math.round(clamp(value, 0, 1) * 100);
}

async function loadListingsFromSupabase(supplierUserId: string): Promise<ListingSnapshot[] | null> {
  if (!supabaseAdmin) return null;

  try {
    const { data, error } = await supabaseAdmin
      .from("food_listing")
      .select("id, food_name, quantity, food_category, pickup_address, status, expected_response_minutes, route_duration_minutes, created_at")
      .eq("supplier_user_id", supplierUserId)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error || !data) {
      return null;
    }

    return data
      .map((row) => {
        const quantity = Number(row.quantity ?? 0);
        const routeDuration = Number(row.route_duration_minutes ?? 0);
        return {
          id: String(row.id),
          food_name: String(row.food_name ?? ""),
          quantity: Number.isFinite(quantity) ? quantity : 0,
          food_category: String(row.food_category ?? ""),
          pickup_address: row.pickup_address ? String(row.pickup_address) : null,
          status: String(row.status ?? "active"),
          expected_response_minutes:
            row.expected_response_minutes == null ? null : Number(row.expected_response_minutes),
          route_duration_minutes: Number.isFinite(routeDuration) ? routeDuration : 0,
          created_at: String(row.created_at ?? new Date().toISOString()),
        } satisfies ListingSnapshot;
      })
      .filter((item) => item.id);
  } catch {
    return null;
  }
}

async function loadListingsFromDb(supplierUserId: string): Promise<ListingSnapshot[]> {
  const rows = await db
    .select({
      id: foodListing.id,
      food_name: foodListing.foodName,
      quantity: foodListing.quantity,
      food_category: foodListing.foodCategory,
      pickup_address: foodListing.pickupAddress,
      status: foodListing.status,
      expected_response_minutes: foodListing.expectedResponseMinutes,
      route_duration_minutes: foodListing.routeDurationMinutes,
      created_at: foodListing.createdAt,
    })
    .from(foodListing)
    .where(eq(foodListing.supplierUserId, supplierUserId))
    .orderBy(desc(foodListing.createdAt))
    .limit(500);

  return rows.map((row) => ({
    ...row,
    created_at: row.created_at.toISOString(),
  }));
}

async function loadProofCount(supplierUserId: string) {
  if (supabaseAdmin) {
    try {
      const { count, error } = await supabaseAdmin
        .from("supplier_proof")
        .select("id", { count: "exact", head: true })
        .eq("supplier_user_id", supplierUserId);

      if (!error && typeof count === "number") {
        return count;
      }
    } catch {
      // Fall back.
    }
  }

  try {
    const rows = await db
      .select({ id: supplierProof.id })
      .from(supplierProof)
      .where(eq(supplierProof.supplierUserId, supplierUserId))
      .limit(1_000);

    if (rows.length) {
      return rows.length;
    }
  } catch {
    // Fall back.
  }

  if (!supabaseAdmin) return 0;

  const bucket = process.env.SUPABASE_STORAGE_PROOF_BUCKET ?? "proofs";

  try {
    const { data, error } = await supabaseAdmin.storage.from(bucket).list("supplier-proofs", {
      limit: 1000,
      sortBy: { column: "name", order: "desc" },
    });

    if (error || !data) return 0;

    return data.filter((item) => item.name.startsWith(`${supplierUserId}-`)).length;
  } catch {
    return 0;
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supplierUserId = session.user.id;

    const [supabaseListings, proofCount] = await Promise.all([
      loadListingsFromSupabase(supplierUserId),
      loadProofCount(supplierUserId),
    ]);

    const listings = supabaseListings ?? (await loadListingsFromDb(supplierUserId));
    const totalListings = listings.length;

    const mealsContributed = listings.reduce((acc, item) => acc + Math.max(0, item.quantity), 0);
    const successfulPickups = listings.filter((item) => ["picked", "delivered", "assigned"].includes(item.status)).length;
    const deliveredCount = listings.filter((item) => item.status === "delivered").length;
    const cancelledCount = listings.filter((item) => ["cancelled", "expired"].includes(item.status)).length;

    const responseSamples = listings
      .map((item) => (item.expected_response_minutes ?? item.route_duration_minutes) || 0)
      .filter((value) => value > 0);

    const avgResponseMinutesRaw = average(responseSamples);
    const averageResponseMinutes = avgResponseMinutesRaw ? Math.round(avgResponseMinutesRaw) : 0;

    const validDescriptionCount = listings.filter((item) => {
      const hasName = item.food_name.trim().length >= 4;
      const hasCategory = VALID_CATEGORIES.has(item.food_category);
      const hasAddress = Boolean(item.pickup_address && item.pickup_address.trim().length >= 4);
      return hasName && hasCategory && hasAddress;
    }).length;

    const successfulHandoverRate = totalListings ? successfulPickups / totalListings : 0;
    const descriptionAccuracyRate = totalListings ? validDescriptionCount / totalListings : 0;
    const cancellationRate = totalListings ? cancelledCount / totalListings : 0;
    const verifiedDeliveryRate = totalListings ? deliveredCount / totalListings : 0;
    const proofCoverageRate = deliveredCount ? clamp(proofCount / deliveredCount, 0, 1) : 0;

    const trustScoreRaw =
      successfulHandoverRate * 35 +
      descriptionAccuracyRate * 25 +
      (1 - cancellationRate) * 20 +
      (verifiedDeliveryRate * 0.6 + proofCoverageRate * 0.4) * 20;

    const trustScore = Math.round(clamp(trustScoreRaw, 0, 100));

    const trustLevel =
      trustScore >= 85
        ? "Platinum"
        : trustScore >= 70
          ? "Gold"
          : trustScore >= 55
            ? "Silver"
            : "Building";

    const peopleServed = Math.round(mealsContributed * 0.92);
    const wastePreventedKg = Number((mealsContributed * WEIGHT_KG_PER_MEAL).toFixed(1));
    const co2ReductionKg = Number((wastePreventedKg * CO2_KG_PER_KG_FOOD).toFixed(1));

    return NextResponse.json({
      source: supabaseListings ? "supabase" : "database",
      metrics: {
        mealsContributed,
        successfulPickups,
        averageResponseMinutes,
        peopleServed,
        wastePreventedKg,
        co2ReductionKg,
      },
      trustProfile: {
        score: trustScore,
        level: trustLevel,
        components: {
          successfulHandoverRate: toPercentage(successfulHandoverRate),
          descriptionAccuracyRate: toPercentage(descriptionAccuracyRate),
          lowCancellationRate: toPercentage(1 - cancellationRate),
          verifiedDeliveryRate: toPercentage(verifiedDeliveryRate),
          proofCoverageRate: toPercentage(proofCoverageRate),
        },
      },
      proofs: {
        count: proofCount,
        bucket: process.env.SUPABASE_STORAGE_PROOF_BUCKET ?? "proofs",
      },
      model: {
        assumptions: {
          kgPerMeal: WEIGHT_KG_PER_MEAL,
          co2PerKgFood: CO2_KG_PER_KG_FOOD,
        },
      },
      recentListings: listings.slice(0, 8).map((item) => ({
        id: item.id,
        foodName: item.food_name,
        status: item.status,
        quantity: item.quantity,
        createdAt: item.created_at,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Unable to compute supplier analytics" }, { status: 500 });
  }
}
