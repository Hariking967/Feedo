import { NextRequest, NextResponse } from "next/server";

interface DummyProduct {
  price?: number;
}

interface DummySearchResponse {
  products?: DummyProduct[];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("query")?.trim() ?? "";
  const unit = request.nextUrl.searchParams.get("unit")?.trim() ?? "meals";

  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  try {
    const response = await fetch(
      `https://dummyjson.com/products/search?q=${encodeURIComponent(query)}&limit=12`,
      { cache: "no-store" },
    );

    if (!response.ok) {
      return NextResponse.json({
        query,
        source: "fallback",
        marketValue: unit === "kg" ? 240 : 180,
        maxAllowedPrice: unit === "kg" ? 120 : 90,
      });
    }

    const json = (await response.json()) as DummySearchResponse;
    const prices = (json.products ?? [])
      .map((product) => Number(product.price ?? 0))
      .filter((price) => Number.isFinite(price) && price > 0);

    if (!prices.length) {
      return NextResponse.json({
        query,
        source: "fallback",
        marketValue: unit === "kg" ? 240 : 180,
        maxAllowedPrice: unit === "kg" ? 120 : 90,
      });
    }

    const averageUsd = prices.reduce((sum, price) => sum + price, 0) / prices.length;
    const estimatedInr = averageUsd * 83;
    const normalizedMarketValue = clamp(
      Math.round(unit === "kg" ? estimatedInr * 0.8 : estimatedInr * 0.45),
      unit === "kg" ? 120 : 70,
      unit === "kg" ? 600 : 260,
    );

    return NextResponse.json({
      query,
      source: "dummyjson",
      marketValue: normalizedMarketValue,
      maxAllowedPrice: Math.round(normalizedMarketValue * 0.5),
    });
  } catch {
    return NextResponse.json({
      query,
      source: "fallback",
      marketValue: unit === "kg" ? 240 : 180,
      maxAllowedPrice: unit === "kg" ? 120 : 90,
    });
  }
}
