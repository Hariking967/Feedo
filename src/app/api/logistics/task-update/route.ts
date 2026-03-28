import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body?.taskId || !body?.status) {
    return NextResponse.json({ error: "taskId and status are required" }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    acceptedAt: Date.now(),
    taskId: body.taskId,
    status: body.status,
    escalated: Boolean(body.escalated),
    proofImageUrl: body.proofImageUrl ?? null,
  });
}
