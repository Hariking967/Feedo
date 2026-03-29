import { NextResponse } from "next/server";

interface MatrixPoint {
  id: string;
  lat: number;
  lng: number;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { points?: MatrixPoint[] } | null;
  const points = body?.points ?? [];

  if (points.length < 2) {
    return NextResponse.json({ error: "At least 2 points required" }, { status: 400 });
  }

  const orsKey = process.env.OPENROUTESERVICE_API_KEY;

  try {
    const locations = points.map((point) => [point.lng, point.lat]);

    if (orsKey) {
      const response = await fetch("https://api.openrouteservice.org/v2/matrix/driving-car", {
        method: "POST",
        headers: {
          Authorization: orsKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          locations,
          metrics: ["distance", "duration"],
          units: "km",
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return NextResponse.json({
          source: "openrouteservice",
          nodeIds: points.map((point) => point.id),
          distanceMatrixKm: data.distances,
          durationMatrixMinutes: (data.durations ?? []).map((row: number[]) => row.map((v) => Math.round(v / 60))),
        });
      }
    }

    const coords = locations.map((pair) => `${pair[0]},${pair[1]}`).join(";");
    const osrm = await fetch(`https://router.project-osrm.org/table/v1/driving/${coords}?annotations=distance,duration`, {
      cache: "no-store",
    });

    if (!osrm.ok) return NextResponse.json({ error: "Matrix provider unavailable" }, { status: 502 });
    const json = await osrm.json();

    return NextResponse.json({
      source: "osrm",
      nodeIds: points.map((point) => point.id),
      distanceMatrixKm: (json.distances ?? []).map((row: number[]) => row.map((value) => Math.round((value / 1000) * 10) / 10)),
      durationMatrixMinutes: (json.durations ?? []).map((row: number[]) => row.map((value) => Math.round(value / 60))),
    });
  } catch {
    return NextResponse.json({ error: "Matrix generation failed" }, { status: 500 });
  }
}
