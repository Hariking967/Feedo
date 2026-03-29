interface OpenRouterChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

function normalizeActions(raw: string, limit: number) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s\-*0-9.)]+/, "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

export async function generateOperationalActions(params: {
  scenario: string;
  maxActions?: number;
  timeoutMs?: number;
}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;

  if (!apiKey || !model) {
    return { source: "disabled" as const, actions: [] as string[] };
  }

  const controller = new AbortController();
  const timeoutMs = Math.max(1500, params.timeoutMs ?? 4500);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 180,
        messages: [
          {
            role: "system",
            content:
              "You are an emergency food redistribution planner. Return 3 short action lines only. No intro, no numbering.",
          },
          {
            role: "user",
            content: `Scenario:\n${params.scenario}`,
          },
        ],
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      return { source: "error" as const, actions: [] as string[] };
    }

    const payload = (await response.json()) as OpenRouterChatResponse;
    const content = payload.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) {
      return { source: "empty" as const, actions: [] as string[] };
    }

    const maxActions = Math.max(1, Math.min(6, params.maxActions ?? 3));
    const actions = normalizeActions(content, maxActions);
    return { source: "openrouter" as const, actions };
  } catch {
    return { source: "error" as const, actions: [] as string[] };
  } finally {
    clearTimeout(timer);
  }
}
