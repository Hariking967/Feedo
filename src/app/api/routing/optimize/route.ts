import { NextResponse } from "next/server";

interface OptimizePayload {
  jobs: Array<{ id: string; location: [number, number] }>;
  start: [number, number];
  end: [number, number];
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as OptimizePayload | null;

  if (!body?.jobs?.length || !body.start || !body.end) {
    return NextResponse.json({ error: "Invalid optimization payload" }, { status: 400 });
  }

  const orsKey = process.env.OPENROUTESERVICE_API_KEY;

  try {
    if (orsKey) {
      const orsPayload = {
        jobs: body.jobs.map((job, idx) => ({ id: idx + 1, location: job.location })),
        vehicles: [
          {
            id: 1,
            profile: "driving-car",
            start: body.start,
            end: body.end,
          },
        ],
      };

      const response = await fetch("https://api.openrouteservice.org/optimization", {
        method: "POST",
        headers: {
          Authorization: orsKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(orsPayload),
      });

      if (response.ok) {
        const data = await response.json();
        return NextResponse.json({ source: "openrouteservice", plan: data });
      }
    }

    const fallbackSequence = [
      "start",
      ...body.jobs.map((job) => job.id),
      "end",
    ];

    return NextResponse.json({
      source: "fallback-nearest",
      sequence: fallbackSequence,
      message: "Using fallback optimization; integrate OR-Tools for stronger VRP planning.",
    });
  } catch {
    return NextResponse.json({ error: "Optimization failed" }, { status: 500 });
  }
}
