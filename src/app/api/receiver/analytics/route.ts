import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

interface RequestUser {
  userId: string;
  userName: string;
  source: "session" | "header-fallback";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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
        userName: session.user.name ?? "Receiver",
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
    userName: request.headers.get("x-feedo-user-name")?.trim() || "Receiver",
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
          totalNeeds: 0,
          activeNeeds: 0,
          matchedNeeds: 0,
          avgMealsPerNeed: 0,
          avgPromptReach: 0,
        },
        charts: {
          needTrend: last7DayKeys().map((day) => ({ day, count: 0 })),
          urgencyBreakdown: [],
          foodPreferenceBreakdown: [],
          inboundRiskBreakdown: [
            { level: "low", count: 0 },
            { level: "medium", count: 0 },
            { level: "high", count: 0 },
          ],
        },
      });
    }

    const [needsRes, listingsRes] = await Promise.all([
      supabaseAdmin
        .from("receiver_need_request")
        .select("id, required_meals, urgency_level, food_preference, status, created_at, targeted_supplier_count")
        .eq("receiver_user_id", requestUser.userId)
        .order("created_at", { ascending: false })
        .limit(500),
      supabaseAdmin
        .from("food_listing")
        .select("id, spoilage_score")
        .eq("assigned_receiver_id", requestUser.userId)
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

    const needs = (needsRes.data ?? []) as Array<{
      id: string;
      required_meals: number;
      urgency_level: string;
      food_preference: string;
      status: string;
      created_at: string;
      targeted_supplier_count: number | null;
    }>;

    const inboundListings = (listingsRes.data ?? []) as Array<{ id: string; spoilage_score: number | null }>;

    const totalNeeds = needs.length;
    const activeNeeds = needs.filter((item) => ["open", "active", "pending"].includes(String(item.status).toLowerCase())).length;
    const matchedNeeds = needs.filter((item) => ["matched", "fulfilled", "completed"].includes(String(item.status).toLowerCase())).length;

    const avgMealsPerNeed = totalNeeds
      ? Math.round(needs.reduce((acc, item) => acc + Math.max(0, Number(item.required_meals ?? 0)), 0) / totalNeeds)
      : 0;

    const targetedReachValues = needs
      .map((item) => Number(item.targeted_supplier_count ?? 0))
      .filter((value) => Number.isFinite(value));
    const avgPromptReach = targetedReachValues.length
      ? Math.round(targetedReachValues.reduce((acc, value) => acc + value, 0) / targetedReachValues.length)
      : 0;

    const trendMap = new Map<string, number>();
    for (const key of last7DayKeys()) trendMap.set(key, 0);
    for (const item of needs) {
      const key = dayKey(item.created_at);
      if (trendMap.has(key)) {
        trendMap.set(key, (trendMap.get(key) ?? 0) + 1);
      }
    }

    const urgencyMap = new Map<string, number>();
    const preferenceMap = new Map<string, number>();

    for (const item of needs) {
      const urgency = String(item.urgency_level ?? "unknown").toLowerCase();
      const pref = String(item.food_preference ?? "any").toLowerCase();
      urgencyMap.set(urgency, (urgencyMap.get(urgency) ?? 0) + 1);
      preferenceMap.set(pref, (preferenceMap.get(pref) ?? 0) + 1);
    }

    let low = 0;
    let medium = 0;
    let high = 0;

    for (const item of inboundListings) {
      const score = clamp(Number(item.spoilage_score ?? 0), 0, 100);
      if (score >= 75) high += 1;
      else if (score >= 50) medium += 1;
      else low += 1;
    }

    return NextResponse.json({
      authMode: requestUser.source,
      source: "supabase",
      metrics: {
        totalNeeds,
        activeNeeds,
        matchedNeeds,
        avgMealsPerNeed,
        avgPromptReach,
      },
      charts: {
        needTrend: [...trendMap.entries()].map(([day, count]) => ({ day, count })),
        urgencyBreakdown: [...urgencyMap.entries()].map(([label, value]) => ({ label, value })),
        foodPreferenceBreakdown: [...preferenceMap.entries()].map(([label, value]) => ({ label, value })),
        inboundRiskBreakdown: [
          { level: "low", count: low },
          { level: "medium", count: medium },
          { level: "high", count: high },
        ],
      },
    });
  } catch {
    return NextResponse.json({ error: "Unable to compute receiver analytics" }, { status: 500 });
  }
}
