import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

interface RequestUser {
  userId: string;
  userName: string;
  source: "session" | "header-fallback";
}

function dayKey(dateLike: string | Date) {
  const date = new Date(dateLike);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function last7DayKeys() {
  const keys: string[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i -= 1) {
    const day = new Date(today);
    day.setDate(today.getDate() - i);
    keys.push(dayKey(day));
  }
  return keys;
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

export async function GET(request: NextRequest) {
  try {
    const requestUser = await resolveRequestUser(request);
    if (!requestUser?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({
        authMode: requestUser.source,
        source: "none",
        metrics: {
          totalEvents: 0,
          acceptedCount: 0,
          deliveredCount: 0,
          proofCount: 0,
          avgEventsPerTask: 0,
        },
        charts: {
          dailyActivity: last7DayKeys().map((day) => ({ day, count: 0 })),
          statusBreakdown: [],
          routeBandBreakdown: [
            { band: "short", count: 0 },
            { band: "medium", count: 0 },
            { band: "long", count: 0 },
          ],
        },
      });
    }

    const [eventsRes, listingsRes] = await Promise.all([
      supabaseAdmin
        .from("volunteer_task_event")
        .select("task_id, status, created_at, proof_image_url")
        .eq("volunteer_user_id", requestUser.userId)
        .order("created_at", { ascending: false })
        .limit(1000),
      supabaseAdmin
        .from("food_listing")
        .select("route_duration_minutes")
        .eq("assigned_volunteer_id", requestUser.userId)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    const events = (eventsRes.data ?? []) as Array<{
      task_id: string;
      status: string;
      created_at: string;
      proof_image_url: string | null;
    }>;

    const routeRows = (listingsRes.data ?? []) as Array<{ route_duration_minutes: number | null }>;

    const totalEvents = events.length;
    const acceptedCount = events.filter((event) => event.status === "accepted").length;
    const deliveredCount = events.filter((event) => event.status === "delivered").length;
    const proofCount = events.filter((event) => Boolean(event.proof_image_url)).length;

    const taskEventCount = new Map<string, number>();
    for (const event of events) {
      const key = String(event.task_id ?? "");
      if (!key) continue;
      taskEventCount.set(key, (taskEventCount.get(key) ?? 0) + 1);
    }

    const avgEventsPerTask = taskEventCount.size
      ? Number((totalEvents / taskEventCount.size).toFixed(1))
      : 0;

    const statusMap = new Map<string, number>();
    for (const event of events) {
      const key = String(event.status ?? "unknown");
      statusMap.set(key, (statusMap.get(key) ?? 0) + 1);
    }

    const trendMap = new Map<string, number>();
    for (const key of last7DayKeys()) trendMap.set(key, 0);
    for (const event of events) {
      const key = dayKey(event.created_at);
      if (trendMap.has(key)) {
        trendMap.set(key, (trendMap.get(key) ?? 0) + 1);
      }
    }

    let short = 0;
    let medium = 0;
    let long = 0;
    for (const row of routeRows) {
      const minutes = Number(row.route_duration_minutes ?? 0);
      if (!Number.isFinite(minutes) || minutes <= 0) continue;
      if (minutes <= 20) short += 1;
      else if (minutes <= 45) medium += 1;
      else long += 1;
    }

    return NextResponse.json({
      authMode: requestUser.source,
      source: "supabase",
      metrics: {
        totalEvents,
        acceptedCount,
        deliveredCount,
        proofCount,
        avgEventsPerTask,
      },
      charts: {
        dailyActivity: [...trendMap.entries()].map(([day, count]) => ({ day, count })),
        statusBreakdown: [...statusMap.entries()].map(([label, value]) => ({ label, value })),
        routeBandBreakdown: [
          { band: "short", count: short },
          { band: "medium", count: medium },
          { band: "long", count: long },
        ],
      },
    });
  } catch {
    return NextResponse.json({ error: "Unable to compute volunteer analytics" }, { status: 500 });
  }
}
