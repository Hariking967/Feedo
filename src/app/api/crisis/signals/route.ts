import { NextRequest, NextResponse } from "next/server";
import { generateOperationalActions } from "@/lib/integrations/openrouter";

export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get("lat") ?? "12.9716");
  const lng = Number(request.nextUrl.searchParams.get("lng") ?? "77.5946");

  const openWeatherKey = process.env.OPENWEATHER_API_KEY;
  const weatherUrl = openWeatherKey
    ? `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${openWeatherKey}`
    : null;

  try {
    const [eonetResponse, weatherResponse] = await Promise.all([
      fetch("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=20", { cache: "no-store" }),
      weatherUrl ? fetch(weatherUrl, { cache: "no-store" }) : Promise.resolve(null),
    ]);

    const eonetJson = eonetResponse.ok ? await eonetResponse.json() : { events: [] };
    const weatherJson = weatherResponse && weatherResponse.ok ? await weatherResponse.json() : null;

    const disasterEvents = Array.isArray(eonetJson?.events) ? eonetJson.events.length : 0;
    const weatherMain = String(weatherJson?.weather?.[0]?.main ?? "unknown");
    const windSpeed = Number(weatherJson?.wind?.speed ?? 0);
    const rain1h = Number(weatherJson?.rain?.["1h"] ?? 0);
    const tempK = Number(weatherJson?.main?.temp ?? 300);
    const tempC = Number.isFinite(tempK) ? tempK - 273.15 : 27;

    const eventScore = Math.min(1, disasterEvents / 20);
    const windScore = Math.min(1, windSpeed / 20);
    const rainScore = Math.min(1, rain1h / 12);
    const heatScore = tempC >= 38 ? Math.min(1, (tempC - 37) / 8) : 0;
    const stormBoost = weatherMain.toLowerCase().includes("storm") ? 0.22 : weatherMain.toLowerCase().includes("rain") ? 0.1 : 0;

    const riskScore = Math.round(
      Math.min(
        100,
        (eventScore * 0.38 + windScore * 0.22 + rainScore * 0.2 + heatScore * 0.2 + stormBoost) * 100,
      ),
    );
    const severity = riskScore >= 72 ? "critical" : riskScore >= 45 ? "elevated" : "normal";

    const heuristicActions = riskScore >= 72
      ? [
          "Escalate critical pickups to nearest volunteers within 4 km.",
          "Temporarily expand recipient radius and prioritize shortest safe routes.",
          "Hold 1 backup volunteer per active zone for spillover assignments.",
        ]
      : riskScore >= 45
        ? [
            "Promote high-urgency listings in matching queues for the next 90 minutes.",
            "Monitor road and weather delays every 15 minutes.",
            "Stage one overflow receiver for fast reassignment if delays increase.",
          ]
        : [
            "Keep balanced matching active and continue standard monitoring.",
            "Refresh weather and event feeds every hour.",
            "Track expiring listings and escalate only when windows tighten.",
          ];

    const llmResult = await generateOperationalActions({
      scenario: [
        `Risk score: ${riskScore}/100`,
        `Severity: ${severity}`,
        `Disaster events open: ${disasterEvents}`,
        `Weather: ${weatherMain}, wind ${windSpeed} m/s, rain ${rain1h} mm/h, temp ${tempC.toFixed(1)} C`,
      ].join("\n"),
      maxActions: 3,
      timeoutMs: 4000,
    });

    return NextResponse.json({
      lat,
      lng,
      sources: {
        eonet: eonetResponse.ok,
        openWeather: Boolean(weatherResponse?.ok),
      },
      disasterEvents,
      weatherMain,
      windSpeed,
      rain1h,
      temperatureC: Number(tempC.toFixed(1)),
      riskScore,
      severity,
      crisisRecommended: riskScore >= 45,
      advisorySource: llmResult.source === "openrouter" ? "openrouter" : "heuristic",
      recommendedActions: llmResult.actions.length ? llmResult.actions : heuristicActions,
    });
  } catch {
    return NextResponse.json({ error: "Crisis signal lookup failed" }, { status: 500 });
  }
}
