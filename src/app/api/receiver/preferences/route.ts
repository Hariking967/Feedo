import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const payloadSchema = z.object({
  role: z.enum(["receiver", "ngo", "recipient"]).optional(),
  displayName: z.string().min(1).max(120).optional(),
  capacity: z.number().int().min(1).max(20000).optional(),
  requiredMeals: z.number().int().min(1).max(20000).optional(),
  acceptedFoodCategories: z.array(z.string().min(1).max(64)).max(20).optional(),
  nutritionPreferences: z.array(z.string().min(1).max(64)).max(30).optional(),
  wantedItems: z.array(z.string().min(1).max(120)).max(40).optional(),
  maxTravelMinutes: z.number().int().min(10).max(360).optional(),
  location: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .optional(),
  active: z.boolean().optional(),
});

interface RequestUser {
  userId: string;
  userName: string;
  source: "session" | "header-fallback";
}

function cleanTextArray(input: string[] | undefined) {
  if (!input?.length) return [] as string[];

  return [...new Set(input.map((item) => item.trim().toLowerCase()).filter(Boolean))];
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

export async function POST(request: NextRequest) {
  try {
    const requestUser = await resolveRequestUser(request);
    if (!requestUser?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({
        success: true,
        mode: "mock",
        message: "Supabase admin is not configured; preferences accepted in mock mode.",
      });
    }

    const body = (await request.json().catch(() => null)) as unknown;
    const parsed = payloadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
    }

    const payload = parsed.data;
    const lat = payload.location?.lat ?? 12.9716;
    const lng = payload.location?.lng ?? 77.5946;

    const record = {
      user_id: requestUser.userId,
      role: payload.role ?? "recipient",
      display_name: payload.displayName ?? requestUser.userName,
      lat,
      lng,
      capacity: payload.capacity ?? payload.requiredMeals ?? 40,
      required_meals: payload.requiredMeals ?? payload.capacity ?? 40,
      accepted_food_categories: cleanTextArray(payload.acceptedFoodCategories),
      nutrition_preferences: cleanTextArray(payload.nutritionPreferences),
      wanted_items: cleanTextArray(payload.wantedItems),
      max_travel_minutes: payload.maxTravelMinutes ?? 70,
      active: payload.active ?? true,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin.from("responder_presence").upsert(record, {
      onConflict: "user_id",
    });

    if (error) {
      return NextResponse.json({ error: "Unable to save receiver preferences", detail: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, authMode: requestUser.source, profile: record });
  } catch {
    return NextResponse.json({ error: "Unable to update receiver preferences" }, { status: 500 });
  }
}
