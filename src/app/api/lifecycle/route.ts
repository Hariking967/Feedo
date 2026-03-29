import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchLifecycleEvents, type LifecycleActorRole } from "@/lib/lifecycle-events";

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
        userName: session.user.name ?? "User",
        source: "session",
      };
    }
  } catch {
    // Fall through to header identity.
  }

  const headerUserId = request.headers.get("x-feedo-user-id")?.trim() ?? "";
  if (!headerUserId) return null;

  return {
    userId: headerUserId,
    userName: request.headers.get("x-feedo-user-name")?.trim() || "User",
    source: "header-fallback",
  };
}

export async function GET(request: NextRequest) {
  try {
    const requestUser = await resolveRequestUser(request);
    if (!requestUser?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const listingId = request.nextUrl.searchParams.get("listingId")?.trim() || undefined;
    const donationEventId = request.nextUrl.searchParams.get("donationEventId")?.trim() || undefined;
    const actorRoleRaw = request.nextUrl.searchParams.get("actorRole")?.trim() || undefined;
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? "80");

    const actorRole =
      actorRoleRaw === "supplier" ||
      actorRoleRaw === "volunteer" ||
      actorRoleRaw === "receiver" ||
      actorRoleRaw === "ngo" ||
      actorRoleRaw === "recipient" ||
      actorRoleRaw === "system"
        ? (actorRoleRaw as LifecycleActorRole)
        : undefined;

    const timeline = await fetchLifecycleEvents({
      supplierUserId: requestUser.userId,
      listingId,
      donationEventId,
      actorRole,
      limit: Number.isFinite(limit) ? limit : 80,
    });

    return NextResponse.json({
      authMode: requestUser.source,
      timeline,
      count: timeline.length,
      filters: { listingId: listingId ?? null, donationEventId: donationEventId ?? null, actorRole: actorRole ?? null },
    });
  } catch {
    return NextResponse.json({ error: "Unable to load lifecycle timeline" }, { status: 500 });
  }
}
