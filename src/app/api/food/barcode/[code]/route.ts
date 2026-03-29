import { NextRequest, NextResponse } from "next/server";

export async function GET(_request: NextRequest, context: { params: Promise<{ code: string }> }) {
  const params = await context.params;
  const code = params.code;
  if (!code) return NextResponse.json({ error: "Barcode required" }, { status: 400 });

  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Open Food Facts unavailable" }, { status: 502 });
    }

    const json = await response.json();
    const product = json?.product;

    if (!product) {
      return NextResponse.json({ found: false, code });
    }

    return NextResponse.json({
      found: true,
      code,
      name: product.product_name ?? "Unknown product",
      ingredients: product.ingredients_text ?? "",
      allergens: product.allergens_tags ?? [],
      nutritionGrade: product.nutrition_grades ?? "unknown",
      categories: product.categories_tags ?? [],
    });
  } catch {
    return NextResponse.json({ error: "Barcode lookup failed" }, { status: 500 });
  }
}
