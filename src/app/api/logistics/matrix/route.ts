import { NextResponse } from "next/server";
import type { MatrixPayload, MatrixResult } from "@/modules/home/types/logistics";

function parsePayload(payload: MatrixPayload | null) {
  if (!payload?.nodes?.length || payload.nodes.length < 2) return null;
  return payload.nodes;
}

function metersToKm(value: number) {
  return Math.round((value / 1000) * 10) / 10;
}

function secondsToMinutes(value: number) {
  return Math.round(value / 60);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as MatrixPayload | null;
  const nodes = parsePayload(body);

  if (!nodes) {
    return NextResponse.json({ error: "At least 2 nodes are required" }, { status: 400 });
  }

  const orsKey = process.env.OPENROUTESERVICE_API_KEY;
  const coordinates = nodes.map((node) => [node.location.lng, node.location.lat]);

  try {
    if (orsKey) {
      const response = await fetch("https://api.openrouteservice.org/v2/matrix/driving-car", {
        method: "POST",
        headers: {
          Authorization: orsKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          locations: coordinates,
          metrics: ["distance", "duration"],
          units: "km",
        }),
      });

      if (response.ok) {
        const json = await response.json();
        const result: MatrixResult = {
          nodeIds: nodes.map((node) => node.id),
          distanceMatrixKm: (json.distances ?? []).map((row: number[]) => row.map((v) => Math.round(v * 10) / 10)),
          durationMatrixMinutes: (json.durations ?? []).map((row: number[]) => row.map((v) => secondsToMinutes(v))),
          source: "openrouteservice",
        };
        return NextResponse.json(result);
      }
    }

    const coords = coordinates.map((pair) => `${pair[0]},${pair[1]}`).join(";");
    const osrmUrl = `https://router.project-osrm.org/table/v1/driving/${coords}?annotations=distance,duration`;
    const osrm = await fetch(osrmUrl);

    if (!osrm.ok) {
      return NextResponse.json({ error: "Matrix provider unavailable" }, { status: 502 });
    }

    const matrixJson = await osrm.json();

    const result: MatrixResult = {
      nodeIds: nodes.map((node) => node.id),
      distanceMatrixKm: (matrixJson.distances ?? []).map((row: number[]) => row.map((v) => metersToKm(v))),
      durationMatrixMinutes: (matrixJson.durations ?? []).map((row: number[]) => row.map((v) => secondsToMinutes(v))),
      source: "osrm",
    };

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Matrix generation failed" }, { status: 500 });
  }
}
