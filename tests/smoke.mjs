import assert from "node:assert/strict";

/** Run against a disposable database in simulation mode. Restores stock in finally. */
const base = (process.env.BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
async function call(method, route, body) {
  const response = await fetch(base + route, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const data = await response.json();
  return { status: response.status, data };
}
async function ok(method, route, body) {
  const result = await call(method, route, body);
  assert.ok(result.status >= 200 && result.status < 300, `${route}: ${result.status} ${JSON.stringify(result.data)}`);
  return result.data;
}
async function checkout(productId, maxDeltaCents = 2500) {
  return (await ok("POST", "/api/orders", {
    productId, buyerName: "Automated Demo Buyer", buyerEmail: "demo-buyer@example.test",
    prefs: { tags: ["wireless", "travel"], colors: [], maxDeltaCents },
  })).order;
}

const health = await ok("GET", "/api/health");
assert.equal(health.ok, true);
assert.equal(health.paypalMode, "simulation", "Automated smoke tests require simulation mode; never create real payment orders unattended.");
const stock = (await ok("GET", "/api/products")).products;
for (const id of ["aurora-headphones", "terra-bottle", "glide-mouse"]) {
  assert.equal(stock.find((p) => p.id === id)?.inStock, true, `Restore ${id} before running smoke tests.`);
}

try {
  const order = await checkout("aurora-headphones");
  const authorized = (await ok("POST", `/api/orders/${order.id}/authorize`)).order;
  assert.equal(authorized.status, "AUTHORIZED");
  const affected = await ok("POST", "/api/merchant/products/aurora-headphones/availability", { inStock: false });
  assert.ok(affected.affectedOrderIds.includes(order.id));
  const proposed = (await ok("POST", `/api/orders/${order.id}/substitute`)).order;
  assert.equal(proposed.status, "AWAITING_CONSENT");
  assert.ok(proposed.substitution.suggestions.length >= 1 && proposed.substitution.suggestions.length <= 2);
  const choice = proposed.substitution.suggestions[0];
  assert.equal(choice.diffCents, choice.priceCents - order.amountCents);
  const rejected = await call("POST", `/api/orders/${order.id}/consent`, { decision: "accept", replacementId: "ember-mug" });
  assert.equal(rejected.status, 422);
  assert.equal(rejected.data.code, "REPLACEMENT_NOT_OFFERED");
  const captured = (await ok("POST", `/api/orders/${order.id}/consent`, { decision: "accept", replacementId: choice.productId })).order;
  assert.equal(captured.status, "CAPTURED");
  assert.equal(captured.finalAmountCents, choice.priceCents);
  assert.match(captured.captureId, /^SIM-/);
  const events = (await ok("GET", `/api/audit?orderId=${order.id}`)).events;
  assert.ok(events.some((e) => e.event === "PAYPAL_CAPTURED" && e.simulated && e.paypalRequestId));
  console.log("PASS: authorize -> stock gap -> proposal -> explicit accept -> exact adjusted capture");

  const declinedOrder = await checkout("glide-mouse");
  await ok("POST", `/api/orders/${declinedOrder.id}/authorize`);
  await ok("POST", "/api/merchant/products/glide-mouse/availability", { inStock: false });
  await ok("POST", `/api/orders/${declinedOrder.id}/substitute`);
  const declined = (await ok("POST", `/api/orders/${declinedOrder.id}/consent`, { decision: "decline" })).order;
  assert.equal(declined.status, "VOIDED");
  assert.equal(declined.finalAmountCents, null);
  console.log("PASS: explicit decline -> void, no capture");

  const expensive = await checkout("terra-bottle", 5000);
  await ok("POST", `/api/orders/${expensive.id}/authorize`);
  await ok("POST", "/api/merchant/products/terra-bottle/availability", { inStock: false });
  const expensiveProposal = (await ok("POST", `/api/orders/${expensive.id}/substitute`)).order;
  const blocked = await call("POST", `/api/orders/${expensive.id}/consent`, { decision: "accept", replacementId: expensiveProposal.substitution.suggestions[0].productId });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.data.code, "SETTLEMENT_BLOCKED");
  const recovered = (await ok("POST", `/api/orders/${expensive.id}/consent`, { decision: "decline" })).order;
  assert.equal(recovered.status, "VOIDED");
  console.log("PASS: unsupported price increase blocked -> safe void recovery");
  console.log("All API smoke checks passed. Payment/model responses were SIMULATED, not live integrations.");
} finally {
  for (const productId of ["aurora-headphones", "terra-bottle", "glide-mouse"]) {
    await ok("POST", `/api/merchant/products/${productId}/availability`, { inStock: true });
  }
}
