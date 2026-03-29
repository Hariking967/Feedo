import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { appendLifecycleEvent } from "@/lib/lifecycle-events";

type VolunteerWorkflowStatus = "accepted" | "arrived_supplier" | "collected" | "in_transit" | "delivered";

interface RequestUser {
  userId: string;
  userName: string;
  source: "session" | "header-fallback";
}

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;

  const mimeType = match[1];
  const base64 = match[2];
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.length > 2_000_000) return null;

  let ext = "jpg";
  if (mimeType.includes("png")) ext = "png";
  if (mimeType.includes("webp")) ext = "webp";

  return { mimeType, bytes, ext };
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

async function sendWorkflowNotification(userIds: string[], payload: { title: string; body: string; taskId: string; status: VolunteerWorkflowStatus }) {
  if (!supabaseAdmin || !userIds.length) {
    return { attempted: 0, sent: 0, queued: 0, mode: "disabled" as const };
  }

  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueUserIds.length) {
    return { attempted: 0, sent: 0, queued: 0, mode: "disabled" as const };
  }

  let tokens: string[] = [];

  try {
    const { data } = await supabaseAdmin
      .from("push_tokens")
      .select("token")
      .in("user_id", uniqueUserIds)
      .limit(500);

    tokens = (data ?? [])
      .map((row) => (typeof row.token === "string" ? row.token.trim() : ""))
      .filter(Boolean);
  } catch {
    tokens = [];
  }

  if (!tokens.length) {
    return { attempted: uniqueUserIds.length, sent: 0, queued: 0, mode: "disabled" as const };
  }

  const serverKey = process.env.FIREBASE_SERVER_KEY;
  if (!serverKey) {
    try {
      await supabaseAdmin.from("notification_outbox").insert(
        tokens.map((token) => ({
          token,
          title: payload.title,
          body: payload.body,
          data: {
            kind: "volunteer_workflow_update",
            taskId: payload.taskId,
            status: payload.status,
          },
          created_at: new Date().toISOString(),
        })),
      );
    } catch {
      // Queue fallback optional.
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
              title: payload.title,
              body: payload.body,
            },
            data: {
              kind: "volunteer_workflow_update",
              taskId: payload.taskId,
              status: payload.status,
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

export async function POST(request: NextRequest) {
  try {
    const requestUser = await resolveRequestUser(request);
    if (!requestUser?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      taskId?: string;
      listingId?: string;
      status?: VolunteerWorkflowStatus;
      subStage?: string;
      proofImageDataUrl?: string;
      proofNote?: string;
      notifyUserIds?: string[];
    } | null;

    if (!body?.taskId || !body?.status) {
      return NextResponse.json({ error: "taskId and status are required" }, { status: 400 });
    }

    let proofImageUrl: string | null = null;

    if (body.proofImageDataUrl && supabaseAdmin) {
      const parsed = parseDataUrl(body.proofImageDataUrl);
      if (!parsed) {
        return NextResponse.json({ error: "Proof image is invalid or too large" }, { status: 413 });
      }

      const bucket = process.env.SUPABASE_STORAGE_PROOF_BUCKET ?? "proofs";
      const filePath = `volunteer-proofs/${requestUser.userId}-${body.taskId}-${Date.now()}.${parsed.ext}`;

      const upload = await supabaseAdmin.storage.from(bucket).upload(filePath, parsed.bytes, {
        cacheControl: "3600",
        upsert: false,
        contentType: parsed.mimeType,
      });

      if (!upload.error) {
        const publicUrl = supabaseAdmin.storage.from(bucket).getPublicUrl(filePath);
        proofImageUrl = publicUrl.data.publicUrl;
      }
    }

    if (supabaseAdmin) {
      try {
        await supabaseAdmin.from("volunteer_task_event").insert({
          id: `vte-${crypto.randomUUID()}`,
          task_id: body.taskId,
          listing_id: body.listingId ?? null,
          volunteer_user_id: requestUser.userId,
          volunteer_name: requestUser.userName,
          status: body.status,
          sub_stage: body.subStage ?? null,
          proof_image_url: proofImageUrl,
          proof_note: body.proofNote?.trim() || null,
          created_at: new Date().toISOString(),
        });
      } catch {
        // Table may be absent in some environments.
      }
    }

    const logisticsMirror = await fetch(new URL("/api/logistics/task-update", request.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId: body.taskId,
        status: body.status,
        proofImageUrl,
      }),
    })
      .then((res) => res.json().catch(() => null))
      .catch(() => null);

    const statusLabel =
      body.status === "accepted"
        ? "Task accepted"
        : body.status === "arrived_supplier"
          ? "Arrived at supplier"
          : body.status === "collected"
            ? "Collection confirmed"
            : body.status === "in_transit"
              ? "Delivery in transit"
              : "Delivery completed";

    const notifyResult = await sendWorkflowNotification(body.notifyUserIds ?? [], {
      title: `Volunteer update: ${statusLabel}`,
      body: `${requestUser.userName} marked task as ${statusLabel.toLowerCase()}.`,
      taskId: body.taskId,
      status: body.status,
    });

    if (body.listingId) {
      await appendLifecycleEvent({
        listingId: body.listingId,
        supplierUserId: requestUser.userId,
        actorUserId: requestUser.userId,
        actorRole: "volunteer",
        eventType:
          body.status === "collected"
            ? "picked_up"
            : body.status === "delivered"
              ? "delivered"
              : "status_updated",
        statusAfter: body.status,
        payload: {
          taskId: body.taskId,
          subStage: body.subStage ?? null,
          proofImageUrl,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      authMode: requestUser.source,
      taskId: body.taskId,
      listingId: body.listingId ?? null,
      volunteerUserId: requestUser.userId,
      status: body.status,
      subStage: body.subStage ?? null,
      proofImageUrl,
      proofNote: body.proofNote?.trim() || null,
      logisticsMirror,
      notification: notifyResult,
      updatedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: "Unable to update volunteer task workflow" }, { status: 500 });
  }
}
