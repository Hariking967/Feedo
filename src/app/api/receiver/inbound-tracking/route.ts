import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { foodListing } from "@/db/schema";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { estimateTravelTime, getWeatherSnapshot } from "@/lib/spoilage-risk";

type TransitStage = "pickup_confirmed" | "en_route" | "nearing_arrival" | "delayed";

interface RequestUser {
  userId: string;
  userName: string;
  source: "session" | "header-fallback";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function stageFromEta(etaMinutes: number, delayRisk: boolean): TransitStage {
  if (delayRisk) return "delayed";
  if (etaMinutes <= 6) return "nearing_arrival";
  if (etaMinutes <= 55) return "en_route";
  return "delayed";
}

async function resolveVolunteerName(volunteerId: string | null) {
  if (!volunteerId || !supabaseAdmin) return null;

  try {
    const { data } = await supabaseAdmin
      .from("responder_presence")
      .select("user_id, display_name")
      .eq("user_id", volunteerId)
      .maybeSingle();

    if (!data) return null;

    return {
      userId: volunteerId,
      displayName: typeof data.display_name === "string" ? data.display_name : "Assigned volunteer",
    };
  } catch {
    return null;
  }
}

async function dispatchTrackingStageNotification(userId: string, stage: TransitStage, etaMinutes: number) {
  if (!supabaseAdmin) {
    return { attempted: 0, sent: 0, queued: 0, mode: "disabled" as const };
  }

  let tokens: string[] = [];
  try {
    const { data } = await supabaseAdmin
      .from("push_tokens")
      .select("token")
      .eq("user_id", userId)
      .limit(20);

    tokens = (data ?? [])
      .map((row) => (typeof row.token === "string" ? row.token.trim() : ""))
      .filter(Boolean);
  } catch {
    tokens = [];
  }

  if (!tokens.length) {
    return { attempted: 0, sent: 0, queued: 0, mode: "disabled" as const };
  }

  const titleByStage: Record<TransitStage, string> = {
    pickup_confirmed: "Pickup confirmed",
    en_route: "Food is en route",
    nearing_arrival: "Food nearing arrival",
    delayed: "Delivery delayed",
  };

  const bodyByStage: Record<TransitStage, string> = {
    pickup_confirmed: "Your assigned volunteer has picked up the donation.",
    en_route: "Redistribution is in transit.",
    nearing_arrival: `Donation is close. ETA about ${etaMinutes} min.`,
    delayed: "Route delay detected. Please distribute quickly on arrival.",
  };

  const serverKey = process.env.FIREBASE_SERVER_KEY;
  if (!serverKey) {
    try {
      await supabaseAdmin.from("notification_outbox").insert(
        tokens.map((token) => ({
          token,
          title: titleByStage[stage],
          body: bodyByStage[stage],
          data: {
            kind: "receiver_tracking_update",
            stage,
            etaMinutes: String(etaMinutes),
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
              title: titleByStage[stage],
              body: bodyByStage[stage],
            },
            data: {
              kind: "receiver_tracking_update",
              stage,
              etaMinutes: String(etaMinutes),
            },
          }),
        });

        if (response.ok) sent += 1;
      } catch {
        // Best effort.
      }
    }),
  );

  return { attempted: tokens.length, sent, queued: Math.max(0, tokens.length - sent), mode: "fcm" as const };
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

    const search = request.nextUrl.searchParams;
    const listingId = String(search.get("listingId") ?? "").trim();
    const startLat = Number(search.get("startLat"));
    const startLng = Number(search.get("startLng"));
    const endLat = Number(search.get("endLat"));
    const endLng = Number(search.get("endLng"));
    const previousStage = String(search.get("previousStage") ?? "").trim().toLowerCase() as TransitStage | "";

    if (!listingId || [startLat, startLng, endLat, endLng].some((value) => Number.isNaN(value))) {
      return NextResponse.json({ error: "listingId and valid coordinates are required" }, { status: 400 });
    }

    const [route, weather, listing] = await Promise.all([
      estimateTravelTime({ lat: startLat, lng: startLng }, { lat: endLat, lng: endLng }),
      getWeatherSnapshot(endLat, endLng),
      db.select().from(foodListing).where(eq(foodListing.id, listingId)).limit(1),
    ]);

    const activeListing = listing[0] ?? null;
    const recommendedWindow = Math.max(20, activeListing?.recommendedPickupWindowMinutes ?? 60);
    const etaMinutes = Math.max(1, route.durationMinutes);
    const delayRisk = etaMinutes > Math.max(30, recommendedWindow * 0.65);

    const spoilageRiskScore = Math.round(
      clamp(
        26 + weather.temperatureC * 1.05 + weather.humidityPct * 0.12 + etaMinutes * 0.85 - Math.min(18, recommendedWindow / 5),
        0,
        100,
      ),
    );

    const warnings: string[] = [];
    if (weather.temperatureC >= 36) {
      warnings.push("High ambient heat detected. Distribute immediately on arrival.");
    }
    if (delayRisk) {
      warnings.push("Route delay may reduce suitability window.");
    }
    if (weather.humidityPct >= 85) {
      warnings.push("High humidity may accelerate quality degradation.");
    }

    const stage = stageFromEta(etaMinutes, delayRisk);
    const volunteerProfile = await resolveVolunteerName(activeListing?.assignedVolunteerId ?? null);

    const stageNotification = previousStage && previousStage !== stage
      ? await dispatchTrackingStageNotification(requestUser.userId, stage, etaMinutes)
      : { attempted: 0, sent: 0, queued: 0, mode: "disabled" as const };

    return NextResponse.json({
      listingId,
      stage,
      stageLabel:
        stage === "pickup_confirmed"
          ? "Pickup Confirmed"
          : stage === "en_route"
            ? "En Route"
            : stage === "nearing_arrival"
              ? "Nearing Arrival"
              : "Delayed",
      pickupCompleted: stage !== "pickup_confirmed" ? true : Boolean(activeListing),
      etaMinutes,
      distanceKm: route.distanceKm,
      assignedVolunteer: volunteerProfile ?? {
        userId: activeListing?.assignedVolunteerId ?? null,
        displayName: "Auto-assigned volunteer",
      },
      suitability: {
        spoilageRiskScore,
        warningLevel: spoilageRiskScore >= 75 ? "high" : spoilageRiskScore >= 50 ? "medium" : "low",
        warnings,
      },
      weather,
      routingSource: route.source,
      notification: stageNotification,
      authMode: requestUser.source,
      lastUpdatedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: "Unable to compute inbound tracking status" }, { status: 500 });
  }
}
