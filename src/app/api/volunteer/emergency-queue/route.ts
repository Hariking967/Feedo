import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { foodListing } from "@/db/schema";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

interface RequestUser {
  userId: string;
  userName: string;
  source: "session" | "header-fallback";
}

function minutesRemaining(isoLike: string | Date | null | undefined) {
  if (!isoLike) return null;
  const ms = new Date(isoLike).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.round((ms - Date.now()) / 60000));
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

    const activeStates = new Set(["active", "assigned", "partial"]);

    let rows: Array<{
      id: string;
      food_name: string;
      supplier_name: string;
      pickup_address: string | null;
      quantity: number;
      priority_state: string;
      status: string;
      expected_response_minutes: number | null;
      assigned_volunteer_id: string | null;
      emergency_expires_at: string | null;
      created_at: string;
    }> = [];

    if (supabaseAdmin) {
      const { data } = await supabaseAdmin
        .from("food_listing")
        .select("id, food_name, supplier_name, pickup_address, quantity, priority_state, status, expected_response_minutes, assigned_volunteer_id, emergency_expires_at, created_at")
        .eq("is_emergency", true)
        .order("created_at", { ascending: false })
        .limit(250);

      rows = (data ?? []).map((row) => ({
        id: String(row.id),
        food_name: String(row.food_name ?? "Food listing"),
        supplier_name: String(row.supplier_name ?? "Supplier"),
        pickup_address: row.pickup_address ? String(row.pickup_address) : null,
        quantity: Number(row.quantity ?? 0),
        priority_state: String(row.priority_state ?? "urgent_circulating"),
        status: String(row.status ?? "active"),
        expected_response_minutes: row.expected_response_minutes == null ? null : Number(row.expected_response_minutes),
        assigned_volunteer_id: row.assigned_volunteer_id ? String(row.assigned_volunteer_id) : null,
        emergency_expires_at: row.emergency_expires_at ? String(row.emergency_expires_at) : null,
        created_at: String(row.created_at ?? new Date().toISOString()),
      }));
    } else {
      const dbRows = await db
        .select({
          id: foodListing.id,
          food_name: foodListing.foodName,
          supplier_name: foodListing.supplierName,
          pickup_address: foodListing.pickupAddress,
          quantity: foodListing.quantity,
          priority_state: foodListing.priorityState,
          status: foodListing.status,
          expected_response_minutes: foodListing.expectedResponseMinutes,
          assigned_volunteer_id: foodListing.assignedVolunteerId,
          emergency_expires_at: foodListing.emergencyExpiresAt,
          created_at: foodListing.createdAt,
          is_emergency: foodListing.isEmergency,
        })
        .from(foodListing)
        .orderBy(desc(foodListing.createdAt))
        .limit(250);

      rows = dbRows
        .filter((row) => row.is_emergency)
        .map((row) => ({
          id: row.id,
          food_name: row.food_name,
          supplier_name: row.supplier_name,
          pickup_address: row.pickup_address,
          quantity: row.quantity,
          priority_state: row.priority_state,
          status: row.status,
          expected_response_minutes: row.expected_response_minutes,
          assigned_volunteer_id: row.assigned_volunteer_id,
          emergency_expires_at: row.emergency_expires_at ? row.emergency_expires_at.toISOString() : null,
          created_at: row.created_at.toISOString(),
        }));
    }

    const queue = rows
      .filter((row) => activeStates.has(row.status))
      .map((row) => ({
        listingId: row.id,
        title: row.food_name,
        supplierName: row.supplier_name,
        pickupAddress: row.pickup_address,
        quantity: Math.max(1, row.quantity),
        status: row.status,
        priorityState: row.priority_state,
        expectedResponseMinutes: row.expected_response_minutes,
        assignedVolunteerId: row.assigned_volunteer_id,
        responseWindowRemainingMinutes: minutesRemaining(row.emergency_expires_at),
        createdAt: row.created_at,
      }));

    const assigned = queue.filter((item) => item.assignedVolunteerId === requestUser.userId);
    const unassigned = queue.filter((item) => !item.assignedVolunteerId);
    const expiringSoon = queue.filter((item) => (item.responseWindowRemainingMinutes ?? 999) <= 30);

    return NextResponse.json({
      authMode: requestUser.source,
      summary: {
        total: queue.length,
        assigned: assigned.length,
        unassigned: unassigned.length,
        expiringSoon: expiringSoon.length,
      },
      queue: {
        assigned,
        unassigned,
        expiringSoon,
      },
    });
  } catch {
    return NextResponse.json({ error: "Unable to load volunteer emergency queue" }, { status: 500 });
  }
}
