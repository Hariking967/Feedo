import { NextRequest, NextResponse } from "next/server";
import type { CrisisState } from "@/modules/home/types/logistics";

function severityFromSignals(weatherRisk: number, eventCount: number, demandSpike: number): CrisisState {
  const severityScore = weatherRisk * 0.4 + Math.min(1, eventCount / 4) * 0.35 + demandSpike * 0.25;

  if (severityScore >= 0.75) {
    return {
      active: true,
      severity: "critical",
      reason: "High weather + disaster event pressure",
      radiusMultiplier: 2,
    };
  }

  if (severityScore >= 0.45) {
    return {
      active: true,
      severity: "elevated",
      reason: "Moderate regional disruption",
      radiusMultiplier: 1.5,
    };
  }

  return {
    active: false,
    severity: "normal",
    reason: "Normal operating conditions",
    radiusMultiplier: 1,
  };
}

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const lat = Number(search.get("lat") ?? "12.9716");
  const lng = Number(search.get("lng") ?? "77.5946");
  const demandSpike = Number(search.get("demandSpike") ?? "0");

  try {
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=precipitation,wind_speed_10m`;
    const [weatherRes, eonetRes] = await Promise.all([
      fetch(weatherUrl),
      fetch("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=20"),
    ]);

    const weatherJson = weatherRes.ok ? await weatherRes.json() : null;
    const eonetJson = eonetRes.ok ? await eonetRes.json() : null;

    const precipitation = Number(weatherJson?.current?.precipitation ?? 0);
    const wind = Number(weatherJson?.current?.wind_speed_10m ?? 0);
    const weatherRisk = Math.min(1, precipitation / 15 + wind / 80);

    const eventCount = Array.isArray(eonetJson?.events) ? eonetJson.events.length : 0;

    const state = severityFromSignals(weatherRisk, eventCount, Math.max(0, Math.min(1, demandSpike)));
    return NextResponse.json(state);
  } catch {
    return NextResponse.json<CrisisState>({
      active: false,
      severity: "normal",
      reason: "Crisis feeds unavailable; using standard radius",
      radiusMultiplier: 1,
    });
  }
}
