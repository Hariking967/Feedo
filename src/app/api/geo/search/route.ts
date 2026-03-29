import { NextRequest, NextResponse } from "next/server";

interface NominatimResult {
  display_name?: string;
  lat?: string;
  lon?: string;
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();
  if (!query) return NextResponse.json({ error: "Query required" }, { status: 400 });

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "FoodRescuePlatform/1.0 (geocoding)",
      },
      cache: "no-store",
    });

    if (!response.ok) return NextResponse.json({ error: "Geocoding unavailable" }, { status: 502 });
    const data = await response.json();

    const mapped = (Array.isArray(data) ? data : []).map((item: NominatimResult) => ({
      displayName: item.display_name ?? "Unknown location",
      lat: Number(item.lat ?? 0),
      lng: Number(item.lon ?? 0),
    }));

    return NextResponse.json(mapped);
  } catch {
    return NextResponse.json({ error: "Geocoding failed" }, { status: 500 });
  }
}
