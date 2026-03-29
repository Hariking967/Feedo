import { NextRequest, NextResponse } from "next/server";
import { supabaseClient } from "@/lib/integrations/supabase";
import { auth } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    token?: string;
    userId?: string;
    role?: "volunteer" | "receiver" | "ngo" | "recipient";
    location?: { lat?: number; lng?: number };
    active?: boolean;
  } | null;
  const token = body?.token?.trim();

  if (!token) return NextResponse.json({ error: "Token required" }, { status: 400 });

  if (!supabaseClient) {
    return NextResponse.json({ success: true, mode: "mock", message: "Supabase not configured; token accepted in mock mode." });
  }

  const session = await auth.api.getSession({ headers: request.headers });
  const userId = body?.userId ?? session?.user?.id ?? "anonymous";

  const { error } = await supabaseClient.from("push_tokens").upsert({
    user_id: userId,
    token,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return NextResponse.json({ error: "Failed to store token", detail: error.message }, { status: 500 });
  }

  const role = body?.role;
  const lat = Number(body?.location?.lat);
  const lng = Number(body?.location?.lng);
  const active = typeof body?.active === "boolean" ? body.active : true;

  if (role && Number.isFinite(lat) && Number.isFinite(lng) && userId !== "anonymous") {
    try {
      await supabaseClient
        .from("responder_presence")
        .upsert(
          {
            user_id: userId,
            role,
            lat,
            lng,
            active,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
    } catch {
      // Optional presence tracking.
    }
  }

  return NextResponse.json({ success: true, mode: "supabase" });
}
