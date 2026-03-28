import { NextRequest, NextResponse } from "next/server";
import type { RouteLeg } from "@/modules/home/types/logistics";

interface ORSFeature {
  geometry: {
    coordinates: number[][];
  };
  properties: {
    summary: {
      distance: number;
      duration: number;
    };
  };
}

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const startLat = Number(search.get("startLat"));
  const startLng = Number(search.get("startLng"));
  const endLat = Number(search.get("endLat"));
  const endLng = Number(search.get("endLng"));

  if ([startLat, startLng, endLat, endLng].some((v) => Number.isNaN(v))) {
    return NextResponse.json({ error: "Invalid coordinate params" }, { status: 400 });
  }

  const orsKey = process.env.OPENROUTESERVICE_API_KEY;

  try {
    if (orsKey) {
      const orsResponse = await fetch("https://api.openrouteservice.org/v2/directions/driving-car/geojson", {
        method: "POST",
        headers: {
          Authorization: orsKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          coordinates: [
            [startLng, startLat],
            [endLng, endLat],
          ],
        }),
      });

      if (orsResponse.ok) {
        const data = (await orsResponse.json()) as { features?: ORSFeature[] };
        const feature = data.features?.[0];
        if (feature) {
          const route: RouteLeg = {
            points: feature.geometry.coordinates.map((point) => [point[1], point[0]]),
            distanceKm: Math.round((feature.properties.summary.distance / 1000) * 10) / 10,
            durationMinutes: Math.round(feature.properties.summary.duration / 60),
          };
          return NextResponse.json(route);
        }
      }
    }

    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;
    const osrmResponse = await fetch(osrmUrl);
    if (!osrmResponse.ok) {
      return NextResponse.json({ error: "No route available" }, { status: 502 });
    }

    const osrmJson = await osrmResponse.json();
    const best = osrmJson.routes?.[0];
    if (!best) {
      return NextResponse.json({ error: "No route geometry" }, { status: 404 });
    }

    const route: RouteLeg = {
      points: best.geometry.coordinates.map((point: number[]) => [point[1], point[0]]),
      distanceKm: Math.round((best.distance / 1000) * 10) / 10,
      durationMinutes: Math.round(best.duration / 60),
    };

    return NextResponse.json(route);
  } catch {
    return NextResponse.json({ error: "Route lookup failed" }, { status: 500 });
  }
}
