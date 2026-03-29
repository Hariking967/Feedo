import { supabaseAdmin } from "@/lib/supabase-admin";

export type LifecycleActorRole = "supplier" | "volunteer" | "receiver" | "ngo" | "recipient" | "system";

export type LifecycleEventType =
  | "listing_created"
  | "emergency_triggered"
  | "volunteer_assigned"
  | "picked_up"
  | "delivered"
  | "confirmed"
  | "expired"
  | "cancelled"
  | "proof_uploaded"
  | "allocation_split"
  | "allocation_completed"
  | "status_updated"
  | "receiver_need_posted";

export interface LifecycleEventInput {
  listingId?: string | null;
  donationEventId?: string | null;
  supplierUserId: string;
  actorUserId: string;
  actorRole: LifecycleActorRole;
  eventType: LifecycleEventType;
  statusAfter?: string | null;
  payload?: Record<string, unknown>;
  occurredAt?: string;
}

export async function appendLifecycleEvent(input: LifecycleEventInput) {
  if (!supabaseAdmin) return { ok: false as const, mode: "disabled" as const };

  const record = {
    id: `lle-${crypto.randomUUID()}`,
    listing_id: input.listingId ?? null,
    donation_event_id: input.donationEventId ?? null,
    supplier_user_id: input.supplierUserId,
    actor_user_id: input.actorUserId,
    actor_role: input.actorRole,
    event_type: input.eventType,
    status_after: input.statusAfter ?? null,
    payload: input.payload ?? {},
    occurred_at: input.occurredAt ?? new Date().toISOString(),
    created_at: new Date().toISOString(),
  };

  try {
    const { error } = await supabaseAdmin.from("listing_lifecycle_event").insert(record);
    if (error) {
      return { ok: false as const, mode: "error" as const, error: error.message };
    }
    return { ok: true as const, mode: "supabase" as const, record };
  } catch {
    return { ok: false as const, mode: "error" as const };
  }
}

export async function fetchLifecycleEvents(options: {
  supplierUserId?: string;
  listingId?: string;
  donationEventId?: string;
  actorRole?: LifecycleActorRole;
  limit?: number;
}) {
  if (!supabaseAdmin) return [];

  let query = supabaseAdmin
    .from("listing_lifecycle_event")
    .select("id, listing_id, donation_event_id, supplier_user_id, actor_user_id, actor_role, event_type, status_after, payload, occurred_at")
    .order("occurred_at", { ascending: false })
    .limit(Math.max(1, Math.min(200, options.limit ?? 80)));

  if (options.supplierUserId) query = query.eq("supplier_user_id", options.supplierUserId);
  if (options.listingId) query = query.eq("listing_id", options.listingId);
  if (options.donationEventId) query = query.eq("donation_event_id", options.donationEventId);
  if (options.actorRole) query = query.eq("actor_role", options.actorRole);

  try {
    const { data } = await query;
    return data ?? [];
  } catch {
    return [];
  }
}
