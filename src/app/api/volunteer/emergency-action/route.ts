import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { foodListing } from "@/db/schema";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { appendLifecycleEvent } from "@/lib/lifecycle-events";

const payloadSchema = z.object({
  listingId: z.string().min(1),
  action: z.enum(["accept", "reject", "mark_en_route", "mark_picked_up", "mark_delivered", "mark_unable"]),
  location: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .optional(),
  note: z.string().max(400).optional(),
  etaMinutes: z.number().int().min(1).max(300).optional(),
});

interface RequestUser {
  userId: string;
  userName: string;
  source: "session" | "header-fallback";
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

function mapActionToState(action: "accept" | "reject" | "mark_en_route" | "mark_picked_up" | "mark_delivered" | "mark_unable") {
  if (action === "accept") {
    return { status: "assigned", priorityState: "urgent_assigned", eventType: "volunteer_assigned" as const };
  }
  if (action === "reject") {
    return { status: "active", priorityState: "urgent_rejected", eventType: "status_updated" as const };
  }
  if (action === "mark_en_route") {
    return { status: "assigned", priorityState: "urgent_en_route", eventType: "status_updated" as const };
  }
  if (action === "mark_picked_up") {
    return { status: "picked", priorityState: "urgent_picked_up", eventType: "picked_up" as const };
  }
  if (action === "mark_delivered") {
    return { status: "delivered", priorityState: "completed", eventType: "delivered" as const };
  }
  return { status: "active", priorityState: "urgent_reassign", eventType: "status_updated" as const };
}

function minutesRemaining(isoLike: string | Date | null | undefined) {
  if (!isoLike) return null;
  const ms = new Date(isoLike).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.round((ms - Date.now()) / 60000));
}

export async function POST(request: NextRequest) {
  try {
    const requestUser = await resolveRequestUser(request);
    if (!requestUser?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as unknown;
    const parsed = payloadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
    }

    const { listingId, action, location, note, etaMinutes } = parsed.data;
    const mapped = mapActionToState(action);

    const listingRows = await db.select().from(foodListing).where(eq(foodListing.id, listingId)).limit(1);
    const listing = listingRows[0];

    if (!listing) {
      return NextResponse.json({ error: "Emergency listing not found" }, { status: 404 });
    }

    const assignedVolunteerId =
      action === "accept"
        ? requestUser.userId
        : action === "reject" || action === "mark_unable"
          ? null
          : listing.assignedVolunteerId ?? requestUser.userId;

    const expectedResponseMinutes =
      action === "accept" && typeof etaMinutes === "number"
        ? etaMinutes
        : listing.expectedResponseMinutes;

    await db
      .update(foodListing)
      .set({
        status: mapped.status,
        priorityState: mapped.priorityState,
        assignedVolunteerId,
        expectedResponseMinutes,
        updatedAt: new Date(),
      })
      .where(eq(foodListing.id, listingId));

    if (supabaseAdmin) {
      try {
        await supabaseAdmin
          .from("food_listing")
          .update({
            status: mapped.status,
            priority_state: mapped.priorityState,
            assigned_volunteer_id: assignedVolunteerId,
            expected_response_minutes: expectedResponseMinutes,
            updated_at: new Date().toISOString(),
          })
          .eq("id", listingId);
      } catch {
        // Optional supabase mirror.
      }
    }

    await appendLifecycleEvent({
      listingId,
      supplierUserId: listing.supplierUserId,
      actorUserId: requestUser.userId,
      actorRole: "volunteer",
      eventType: mapped.eventType,
      statusAfter: mapped.priorityState,
      payload: {
        action,
        note: note?.trim() || null,
        etaMinutes: etaMinutes ?? null,
        location: location ?? null,
      },
    });

    return NextResponse.json({
      authMode: requestUser.source,
      listingId,
      action,
      listingStatus: mapped.status,
      priorityState: mapped.priorityState,
      assignedVolunteerId,
      responseWindowRemainingMinutes: minutesRemaining(listing.emergencyExpiresAt),
      emittedEvent: {
        eventType: mapped.eventType,
        occurredAt: new Date().toISOString(),
      },
    });
  } catch {
    return NextResponse.json({ error: "Unable to update volunteer emergency action" }, { status: 500 });
  }
}
