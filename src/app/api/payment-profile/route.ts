import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { supplierPaymentProfile } from "@/db/schema";
import { auth } from "@/lib/auth";

const MAX_QR_URL_LENGTH = 2_500_000;

function isSupportedQrUrl(url: string) {
  return url.startsWith("data:image/") || url.startsWith("http://") || url.startsWith("https://");
}

export async function GET(request: NextRequest) {
  const supplierId = request.nextUrl.searchParams.get("supplierId");

  try {
    if (supplierId) {
      const [profile] = await db
        .select()
        .from(supplierPaymentProfile)
        .where(eq(supplierPaymentProfile.userId, supplierId))
        .limit(1);

      return NextResponse.json({ profile: profile ?? null });
    }

    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [profile] = await db
      .select()
      .from(supplierPaymentProfile)
      .where(eq(supplierPaymentProfile.userId, session.user.id))
      .limit(1);

    return NextResponse.json({ profile: profile ?? null });
  } catch {
    return NextResponse.json({ error: "Unable to fetch payment profile" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = (await request.json()) as { qrImageUrl?: unknown };
    const qrImageUrl = typeof payload.qrImageUrl === "string" ? payload.qrImageUrl.trim() : "";

    if (!qrImageUrl || !isSupportedQrUrl(qrImageUrl)) {
      return NextResponse.json({ error: "Provide a valid QR image URL or image data URL" }, { status: 400 });
    }

    if (qrImageUrl.length > MAX_QR_URL_LENGTH) {
      return NextResponse.json({ error: "QR image is too large" }, { status: 413 });
    }

    const now = new Date();
    await db
      .insert(supplierPaymentProfile)
      .values({
        userId: session.user.id,
        qrImageUrl,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: supplierPaymentProfile.userId,
        set: {
          qrImageUrl,
          updatedAt: now,
        },
      });

    const [profile] = await db
      .select()
      .from(supplierPaymentProfile)
      .where(eq(supplierPaymentProfile.userId, session.user.id))
      .limit(1);

    return NextResponse.json({ profile: profile ?? null });
  } catch {
    return NextResponse.json({ error: "Unable to save payment profile" }, { status: 500 });
  }
}
