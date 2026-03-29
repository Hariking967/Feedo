import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { foodName, quantity, foodCategory } = body;

    if (!foodName || !quantity) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "stepfun/step-3.5-flash:free";

    if (!OPENROUTER_API_KEY) {
      return NextResponse.json({ error: "OpenRouter API Key is missing" }, { status: 500 });
    }

    const prompt = `As an expert appraiser for Indian food prices (in INR), provide the typical baseline market value for:
Food item: ${foodName}
Category: ${foodCategory}
Quantity: ${quantity} meals/servings

You MUST ONLY return the exact numeric value (in INR) representing the total market value for this quantity. Do NOT include words, ranges, or explanations. If you think it costs Rs. 2000, simply return: 2000`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API failed with status ${response.status}`);
    }

    const data = await response.json();
    const resultText = data.choices?.[0]?.message?.content?.trim();
    
    // Parse the result strictly to a number
    const numericMatch = resultText.match(/\\d+(?:\\.\\d+)?/);
    if (!numericMatch) {
      throw new Error("AI returned invalid non-numeric response");
    }

    const marketValue = parseFloat(numericMatch[0]);

    return NextResponse.json({ marketValue });
  } catch (error) {
    console.error("AI Market value error:", error);
    return NextResponse.json({ error: "Unable to calculate market value" }, { status: 500 });
  }
}
