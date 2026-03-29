import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { foodListing, supplierProof } from "@/db/schema";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const payloadSchema = z.object({
  imageBase64: z.string().min(32),
  listingId: z.string().optional(),
  mimeType: z.string().optional(),
});

const MAX_BYTES = 5 * 1024 * 1024;

function extensionFromMime(mimeType: string | undefined) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

function normalizeBase64(input: string) {
  const dataUrlMatch = input.match(/^data:(.*?);base64,(.*)$/);
  if (dataUrlMatch) {
    return {
      mimeType: dataUrlMatch[1] || "image/jpeg",
      value: dataUrlMatch[2] || "",
    };
  }

  return {
    mimeType: "image/jpeg",
    value: input,
  };
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Supabase storage is not configured" }, { status: 503 });
    }

    const body = (await request.json().catch(() => null)) as unknown;
    const parsed = payloadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
    }

    const normalized = normalizeBase64(parsed.data.imageBase64);
    const mimeType = parsed.data.mimeType || normalized.mimeType;
    const ext = extensionFromMime(mimeType);

    const raw = Buffer.from(normalized.value, "base64");
    if (!raw.length || raw.length > MAX_BYTES) {
      return NextResponse.json({ error: "Proof image is invalid or too large" }, { status: 413 });
    }

    const supplierId = session.user.id;
    const listingId = parsed.data.listingId?.trim() || "misc";
    const bucket = process.env.SUPABASE_STORAGE_PROOF_BUCKET ?? "proofs";
    const filePath = `supplier-proofs/${supplierId}-${listingId}-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage.from(bucket).upload(filePath, raw, {
      upsert: false,
      contentType: mimeType,
      cacheControl: "3600",
    });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message || "Unable to upload proof" }, { status: 500 });
    }

    if (parsed.data.listingId) {
      await db
        .update(foodListing)
        .set({
          status: "delivered",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(foodListing.id, parsed.data.listingId),
            eq(foodListing.supplierUserId, supplierId),
          ),
        );

      try {
        await supabaseAdmin
          .from("food_listing")
          .update({
            status: "delivered",
            updated_at: new Date().toISOString(),
          })
          .eq("id", parsed.data.listingId)
          .eq("supplier_user_id", supplierId);
      } catch {
        // Mirror update is optional.
      }
    }

    const publicUrl = supabaseAdmin.storage.from(bucket).getPublicUrl(filePath).data.publicUrl;

    await db.insert(supplierProof).values({
      id: `spr-${crypto.randomUUID()}`,
      supplierUserId: supplierId,
      listingId: parsed.data.listingId ?? null,
      bucket,
      filePath,
      publicUrl: publicUrl || null,
      mimeType,
      sizeBytes: raw.length,
      createdAt: new Date(),
    });

    try {
      await supabaseAdmin.from("supplier_proof").insert({
        id: `spr-${crypto.randomUUID()}`,
        supplier_user_id: supplierId,
        listing_id: parsed.data.listingId ?? null,
        bucket,
        file_path: filePath,
        public_url: publicUrl || null,
        mime_type: mimeType,
        size_bytes: raw.length,
        created_at: new Date().toISOString(),
      });
    } catch {
      // Proof mirror is optional.
    }

    return NextResponse.json({
      success: true,
      bucket,
      filePath,
      publicUrl,
      listingId: parsed.data.listingId ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Unable to upload supplier proof" }, { status: 500 });
  }
}
