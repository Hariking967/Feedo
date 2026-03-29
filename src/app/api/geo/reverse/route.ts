import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lng = Number(request.nextUrl.searchParams.get("lng"));

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return NextResponse.json({ error: "lat/lng required" }, { status: 400 });
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "FoodRescuePlatform/1.0 (reverse-geocoding)",
      },
      cache: "no-store",
    });

    if (!response.ok) return NextResponse.json({ error: "Reverse geocoding unavailable" }, { status: 502 });

    const data = await response.json();
    return NextResponse.json({
      displayName: data.display_name ?? "Unknown location",
      lat,
      lng,
    });
  } catch {
    return NextResponse.json({ error: "Reverse geocoding failed" }, { status: 500 });
  }
}
