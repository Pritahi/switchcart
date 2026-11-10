import assert from "node:assert/strict";
import test from "node:test";
import { centsToApiValue, fmtSignedMoney } from "../src/lib/format";
import { maximumCaptureCents, planSettlement } from "../src/lib/payment-policy";
import { SEED_PRODUCTS } from "../src/data/catalog";
import type { ProductDTO } from "../src/lib/types";

// Unit tests never spend money or call an external model.
process.env.AI_API_KEY = "";
process.env.PAYPAL_CLIENT_ID = "";
process.env.PAYPAL_CLIENT_SECRET = "";
const products: ProductDTO[] = SEED_PRODUCTS.map((p) => ({ ...p, merchantId: "nova", currency: "USD" }));
const original = products.find((p) => p.id === "aurora-headphones")!;
const prefs = { tags: ["wireless"], colors: [] as string[], maxDeltaCents: 2500 };
const now = new Date("2026-11-10T20:00:00Z");
const basePolicy = { authorizedCents: 10_000, finalCents: 11_000, currency: "USD", authorizedAt: now, increaseUsed: false, now };

test("money is formatted from integer cents with exact signs", () => {
  assert.equal(centsToApiValue(18_901), "189.01");
  assert.equal(fmtSignedMoney(-6_000), "-$60.00");
  assert.equal(fmtSignedMoney(1_250), "+$12.50");
  assert.equal(fmtSignedMoney(0), "$0.00");
});

test("fallback is deterministic, proposes at most two, excludes original and OOS", async () => {
  const { proposeSubstitutions } = await import("../src/lib/ai");
  const candidates = products.filter((p) => p.id !== original.id).map((p) => ({ ...p, inStock: p.id !== "pulse-speaker" }));
  const a = await proposeSubstitutions(original, candidates, prefs);
  const b = await proposeSubstitutions(original, candidates, prefs);
  assert.equal(a.provider, "rule-fallback");
  assert.deepEqual(a.suggestions, b.suggestions);
  assert.ok(a.suggestions.length >= 1 && a.suggestions.length <= 2);
  for (const s of a.suggestions) {
    assert.notEqual(s.productId, original.id);
    assert.notEqual(s.productId, "pulse-speaker");
    assert.equal(s.diffCents, products.find((p) => p.id === s.productId)!.priceCents - original.priceCents);
  }
});

test("fallback enforces the buyer's extra-spend ceiling", async () => {
  const { proposeSubstitutions } = await import("../src/lib/ai");
  const cheap = products.find((p) => p.id === "terra-bottle")!;
  const result = await proposeSubstitutions(cheap, products.filter((p) => p.id !== cheap.id), { ...prefs, maxDeltaCents: 0 });
  assert.ok(result.suggestions.every((s) => s.diffCents <= 0));
});

test("lower/equal amounts capture without reauthorization", () => {
  assert.equal(planSettlement({ ...basePolicy, finalCents: 9_000 }).kind, "capture");
  assert.equal(planSettlement({ ...basePolicy, finalCents: 10_000 }).kind, "capture");
});

test("small consented increase captures during initial honor period", () => {
  assert.equal(planSettlement(basePolicy).kind, "capture");
});

test("increase reauthorizes after honor period and before authorization expiry", () => {
  assert.equal(planSettlement({ ...basePolicy, now: new Date("2026-11-14T20:00:00Z") }).kind, "reauthorize");
});

test("PayPal increase cap is the lesser of 115% and $75", () => {
  assert.equal(maximumCaptureCents(10_000), 11_500);
  assert.equal(maximumCaptureCents(100_000), 107_500);
  assert.equal(planSettlement({ ...basePolicy, finalCents: 11_501 }).kind, "blocked");
  assert.equal(planSettlement({ ...basePolicy, authorizedCents: 100_000, finalCents: 107_501 }).kind, "blocked");
});

test("missing metadata, repeated increase, expiry and non-USD fail safely", () => {
  assert.equal(planSettlement({ ...basePolicy, authorizedAt: null }).kind, "blocked");
  assert.equal(planSettlement({ ...basePolicy, now: new Date("2026-11-14T20:00:00Z"), increaseUsed: true }).kind, "blocked");
  assert.equal(planSettlement({ ...basePolicy, now: new Date("2026-12-11T20:00:00Z") }).kind, "blocked");
  assert.equal(planSettlement({ ...basePolicy, currency: "EUR" }).kind, "blocked");
});

test("simulated PayPal IDs are explicitly labeled and retry key is retained", async () => {
  const paypal = await import("../src/lib/paypal");
  const result = await paypal.ppCapture("SIM-AUTH-TEST", 7_900, "USD", "TEST-INVOICE", "stable-test-key");
  assert.equal(result.simulated, true);
  assert.equal(result.paypalRequestId, "stable-test-key");
  assert.match(String(result.response?.id), /^SIM-CAP-/);
  assert.equal(result.response?.status, "COMPLETED");
  const renewed = await paypal.ppReauthorize("SIM-AUTH-OLD", 11_000, "USD", "stable-reauth-key");
  assert.notEqual(renewed.response?.id, "SIM-AUTH-OLD");
  assert.equal(renewed.paypalRequestId, "stable-reauth-key");
  const voided = await paypal.ppVoid("SIM-AUTH-TEST");
  assert.equal(voided.httpStatus, 204);
  assert.equal(voided.response, null);
});
