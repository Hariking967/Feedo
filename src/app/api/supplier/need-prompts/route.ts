import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({
        source: "mock",
        prompts: [],
      });
    }

    const { data, error } = await supabaseAdmin
      .from("supplier_need_prompt")
      .select("id, need_request_id, supplier_user_id, supplier_name, prompt_score, distance_km, recent_listing_count, avg_quantity, prompt_status, sent_at, acknowledged_at, created_at")
      .eq("supplier_user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: "Unable to load supplier prompts", detail: error.message }, { status: 500 });
    }

    const openNeedIds = [...new Set((data ?? []).map((item) => item.need_request_id).filter(Boolean))];

    let needs: Array<Record<string, unknown>> = [];
    if (openNeedIds.length) {
      const { data: needRows } = await supabaseAdmin
        .from("receiver_need_request")
        .select("id, receiver_name, need_title, required_meals, food_preference, meal_slot, window_start_at, window_end_at, urgency_level, note, location_address, status")
        .in("id", openNeedIds)
        .limit(50);

      needs = needRows ?? [];
    }

    const needById = new Map<string, Record<string, unknown>>();
    for (const item of needs) {
      if (typeof item.id === "string") {
        needById.set(item.id, item);
      }
    }

    return NextResponse.json({
      source: "supabase",
      prompts: (data ?? []).map((item) => ({
        ...item,
        need: needById.get(item.need_request_id) ?? null,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Unable to fetch supplier need prompts" }, { status: 500 });
  }
}
