import type { BuyerPrefs, ProductDTO, SuggestionDTO } from "@/lib/types";

/**
 * Substitution engine.
 *
 * Primary path: OpenAI-compatible Chat Completions API
 *   POST {AI_BASE_URL}/chat/completions   (default https://api.openai.com/v1)
 *   model: AI_MODEL                       (default gpt-4o-mini)
 *   key:  AI_API_KEY
 *
 * Fallback path (always available, used when AI_API_KEY is unset or the API
 * errors/times out or returns unusable JSON): a deterministic rule-based
 * scorer over category, shared tags, buyer preference overlap and price
 * closeness. The `aiProvider` field on every substitution records which path
 * produced it, for hackathon transparency.
 */

export interface AiOutcome {
  suggestions: SuggestionDTO[];
  provider: "ai-api" | "rule-fallback";
  model: string | null;
  /** Raw model output (trimmed) or fallback/error description, for auditing. */
  raw: string | null;
}

const AI_API_KEY = process.env.AI_API_KEY || "";
const AI_BASE_URL = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
const AI_MODEL = process.env.AI_MODEL || "gpt-4o-mini";

export const AI_CONFIGURED = Boolean(AI_API_KEY);

function toSuggestion(original: ProductDTO, p: ProductDTO, rationale: string): SuggestionDTO {
  return {
    productId: p.id,
    name: p.name,
    category: p.category,
    priceCents: p.priceCents,
    currency: p.currency,
    diffCents: p.priceCents - original.priceCents,
    rationale,
    icon: p.icon,
    hue: p.hue,
    tags: p.tags,
  };
}

// ---------------------------------------------------------------------------
// Deterministic rule-based fallback
// ---------------------------------------------------------------------------

interface Scored {
  product: ProductDTO;
  score: number;
  reasons: string[];
}

function scoreCandidate(original: ProductDTO, c: ProductDTO, prefs: BuyerPrefs): Scored {
  let score = 0;
  const reasons: string[] = [];

  if (c.category === original.category) {
    score += 3;
    reasons.push(`same ${c.category} category`);
  }

  const sharedTags = c.tags.filter((t) => original.tags.includes(t));
  if (sharedTags.length) {
    score += sharedTags.length * 2;
    reasons.push(`shares traits with the original (${sharedTags.slice(0, 3).join(", ")})`);
  }

  const prefHits = c.tags.filter(
    (t) => prefs.tags.includes(t) || prefs.colors.includes(t),
  );
  if (prefHits.length) {
    score += prefHits.length * 3;
    reasons.push(`matches buyer preferences (${prefHits.slice(0, 3).join(", ")})`);
  }

  const diff = c.priceCents - original.priceCents;
  const absDiff = Math.abs(diff);
  if (absDiff === 0) {
    score += 4;
    reasons.push("identical price");
  } else if (absDiff <= original.priceCents * 0.15) {
    score += 3;
    reasons.push("price within 15% of the original");
  } else if (absDiff <= original.priceCents * 0.3) {
    score += 1;
    reasons.push("price within 30% of the original");
  }

  if (prefs.maxDeltaCents != null && diff > prefs.maxDeltaCents) {
    score -= 10; // buyer said: do not exceed my extra-spend ceiling
  }

  return { product: c, score, reasons };
}

function ruleFallback(
  original: ProductDTO,
  candidates: ProductDTO[],
  prefs: BuyerPrefs,
  note: string | null,
): AiOutcome {
  const scored = candidates
    .filter((c) => c.inStock && c.id !== original.id)
    .map((c) => scoreCandidate(original, c, prefs))
    .sort((a, b) =>
      b.score !== a.score
        ? b.score - a.score
        : a.product.priceCents - b.product.priceCents,
    )
    .filter((s) => s.score > 0 && (
      prefs.maxDeltaCents == null ||
      s.product.priceCents - original.priceCents <= prefs.maxDeltaCents
    ))
    .slice(0, 2);

  const suggestions = scored.map((s) => {
    const diff = s.product.priceCents - original.priceCents;
    const priceNote =
      diff === 0
        ? "No price difference."
        : diff > 0
          ? `Costs $${(diff / 100).toFixed(2)} more than the original.`
          : `Saves $${(Math.abs(diff) / 100).toFixed(2)} versus the original.`;
    const base = s.reasons.length
      ? `Recommended because it is in stock, fits the ${s.reasons.slice(0, 2).join(" and ")}.`
      : "Closest in-stock alternative in the catalog.";
    return toSuggestion(original, s.product, `${base} ${priceNote}`);
  });

  return {
    suggestions,
    provider: "rule-fallback",
    model: "switchcart-rules-v1",
    raw: note
      ? `rule-fallback (${note}); scored ${candidates.length} candidates, kept ${suggestions.length}`
      : `rule-fallback; scored ${candidates.length} candidates, kept ${suggestions.length}`,
  };
}

// ---------------------------------------------------------------------------
// OpenAI-compatible path
// ---------------------------------------------------------------------------

function stripCodeFences(s: string): string {
  return s
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

export async function proposeSubstitutions(
  original: ProductDTO,
  candidates: ProductDTO[],
  prefs: BuyerPrefs,
): Promise<AiOutcome> {
  if (!AI_CONFIGURED) {
    return ruleFallback(original, candidates, prefs, "AI_API_KEY not configured");
  }

  const catalogView = candidates.map((c) => ({
    productId: c.id,
    name: c.name,
    category: c.category,
    priceUsd: (c.priceCents / 100).toFixed(2),
    tags: c.tags,
    description: c.description,
    priceDiffUsdVsOriginal: ((c.priceCents - original.priceCents) / 100).toFixed(2),
  }));

  const system = [
    "You are SwitchCart, a checkout recovery engine for a PayPal merchant.",
    "A product went OUT OF STOCK after the buyer approved a PayPal payment authorization.",
    "Pick 1 or 2 in-stock replacement products ONLY from the candidate catalog list provided.",
    "Never suggest the out-of-stock item itself or anything not in the candidate list.",
    "Respect the buyer preferences and their maximum extra spend. Prefer small absolute price differences.",
    "Respond with STRICT JSON only, no prose, shaped exactly:",
    '{"suggestions":[{"productId":"<id from catalog>","rationale":"<one or two friendly sentences mentioning the exact price difference>"}]}',
  ].join(" ");

  const user = JSON.stringify({
    outOfStockItem: {
      productId: original.id,
      name: original.name,
      category: original.category,
      priceUsd: (original.priceCents / 100).toFixed(2),
      tags: original.tags,
    },
    buyerPreferences: {
      tags: prefs.tags,
      colors: prefs.colors,
      maxExtraSpendUsd:
        prefs.maxDeltaCents == null ? null : (prefs.maxDeltaCents / 100).toFixed(2),
    },
    candidates: catalogView,
  });

  try {
    const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        temperature: 0.2,
        max_tokens: 500,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return ruleFallback(
        original,
        candidates,
        prefs,
        `AI API HTTP ${res.status}: ${body.slice(0, 200)}`,
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(stripCodeFences(content)) as {
      suggestions?: Array<{ productId?: string; rationale?: string }>;
    };

    const byId = new Map(candidates.map((c) => [c.id, c]));
    const seen = new Set<string>();
    const suggestions: SuggestionDTO[] = [];
    for (const s of parsed.suggestions ?? []) {
      if (!s.productId || seen.has(s.productId) || suggestions.length >= 2) continue;
      const p = byId.get(s.productId);
      if (!p || !p.inStock || p.id === original.id || (prefs.maxDeltaCents != null && p.priceCents - original.priceCents > prefs.maxDeltaCents)) continue;
      seen.add(s.productId);
      suggestions.push(
        toSuggestion(
          original,
          p,
          (s.rationale || "AI-recommended in-stock alternative.").slice(0, 400),
        ),
      );
    }

    if (!suggestions.length) {
      return ruleFallback(original, candidates, prefs, "AI returned no usable suggestions");
    }

    return {
      suggestions,
      provider: "ai-api",
      model: AI_MODEL,
      raw: content.slice(0, 2000),
    };
  } catch (e) {
    return ruleFallback(
      original,
      candidates,
      prefs,
      `AI call failed: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300),
    );
  }
}
