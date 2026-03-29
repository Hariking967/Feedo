import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

interface RequestUser {
  userId: string;
  userName: string;
  source: "session" | "header-fallback";
}

const profileSchema = z.object({
  transportMode: z.enum(["bike", "scooter", "van", "truck"]),
  carryingCapacityKg: z.number().min(5).max(500),
  preferredZones: z.array(z.string().min(1).max(80)).max(12).optional(),
  active: z.boolean().optional(),
  location: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .optional(),
});

function cleanPreferredZones(input: string[] | undefined) {
  if (!input?.length) return [] as string[];
  return [...new Set(input.map((zone) => zone.trim()).filter(Boolean))].slice(0, 12);
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

export async function POST(request: NextRequest) {
  try {
    const requestUser = await resolveRequestUser(request);
    if (!requestUser?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as unknown;
    const parsed = profileSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({
        success: true,
        authMode: requestUser.source,
        mode: "mock",
        profile: parsed.data,
      });
    }

    const payload = parsed.data;
    const zones = cleanPreferredZones(payload.preferredZones);
    const lat = payload.location?.lat ?? 12.9716;
    const lng = payload.location?.lng ?? 77.5946;

    await supabaseAdmin
      .from("responder_presence")
      .upsert(
        {
          user_id: requestUser.userId,
          role: "volunteer",
          display_name: requestUser.userName,
          lat,
          lng,
          active: payload.active ?? true,
          capacity: Math.round(payload.carryingCapacityKg),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    let profileMode: "supabase" | "degraded" = "supabase";

    try {
      await supabaseAdmin
        .from("volunteer_profile")
        .upsert(
          {
            user_id: requestUser.userId,
            transport_mode: payload.transportMode,
            carrying_capacity_kg: Math.round(payload.carryingCapacityKg),
            preferred_zones: zones,
            active: payload.active ?? true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
    } catch {
      profileMode = "degraded";
    }

    return NextResponse.json({
      success: true,
      authMode: requestUser.source,
      mode: profileMode,
      profile: {
        userId: requestUser.userId,
        displayName: requestUser.userName,
        transportMode: payload.transportMode,
        carryingCapacityKg: Math.round(payload.carryingCapacityKg),
        preferredZones: zones,
        active: payload.active ?? true,
        location: { lat, lng },
      },
    });
  } catch {
    return NextResponse.json({ error: "Unable to save volunteer profile" }, { status: 500 });
  }
}
