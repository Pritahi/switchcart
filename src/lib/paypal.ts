import { randomUUID } from "node:crypto";
import { centsToApiValue } from "@/lib/format";

/**
 * PayPal Orders v2 + Payments v2 (authorizations) REST client.
 *
 * Real endpoints used (sandbox base URL by default):
 *   POST {base}/v1/oauth2/token                                  (OAuth2 client_credentials)
 *   POST {base}/v2/checkout/orders                               (intent=AUTHORIZE)
 *   POST {base}/v2/checkout/orders/{orderId}/authorize
 *   POST {base}/v2/payments/authorizations/{authorizationId}/capture
 *   POST {base}/v2/payments/authorizations/{authorizationId}/void
 *   POST {base}/v2/payments/authorizations/{authorizationId}/reauthorize
 *
 * If PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are unset, the client runs in
 * deterministic SIMULATION mode, returning sandbox-shaped payloads with
 * `SIM-` prefixed IDs so the full authorize -> capture/void flow is demoable
 * offline. Every audit event records `simulated: true` in that case.
 *
 * Demo failure knobs (simulation mode only):
 *   SIM_FORCE_CAPTURE_FAILURE=1       -> capture returns a 422
 *   SIM_FORCE_REAUTHORIZE_FAILURE=1   -> reauthorize returns a 422
 */

type Json = Record<string, unknown>;

const BASE = (process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com").replace(
  /\/+$/,
  "",
);
const CLIENT_ID = process.env.PAYPAL_CLIENT_ID || "";
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || "";

export const PAYPAL_MODE: "sandbox" | "simulation" =
  CLIENT_ID && CLIENT_SECRET ? "sandbox" : "simulation";

export interface PayPalOpResult {
  ok: boolean;
  action: string;
  httpStatus: number | null;
  /** The `PayPal-Request-Id` we sent (idempotency/trace header). */
  paypalRequestId: string;
  /** The `PayPal-Debug-Id` returned by PayPal response headers (`PM-...` in sim). */
  paypalDebugId: string | null;
  request: Json;
  response: Json | null;
  error: string | null;
  simulated: boolean;
}

function rid(prefix: string): string {
  return `${prefix}-${randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// OAuth2
// ---------------------------------------------------------------------------

let tokenCache: { token: string; expMs: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expMs > Date.now()) return tokenCache.token;
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(15000),
  });
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!res.ok || !data.access_token) {
    throw new Error(`PayPal OAuth token request failed (HTTP ${res.status})`);
  }
  tokenCache = {
    token: data.access_token,
    expMs: Date.now() + (data.expires_in ?? 300) * 1000 - 60_000,
  };
  return data.access_token;
}

// ---------------------------------------------------------------------------
// Low-level caller (real sandbox)
// ---------------------------------------------------------------------------

async function callApi(
  path: string,
  init: { method: string; body?: Json; requestId?: string },
): Promise<{ httpStatus: number; data: Json | null; debugId: string | null }> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  if (init.requestId) headers["PayPal-Request-Id"] = init.requestId;
  const res = await fetch(`${BASE}${path}`, {
    method: init.method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(15000),
  });
  const debugId = res.headers.get("paypal-debug-id");
  const text = await res.text();
  let data: Json | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as Json;
    } catch {
      data = { raw: text };
    }
  }
  return { httpStatus: res.status, data, debugId };
}

function describeError(data: Json | null, httpStatus: number | null): string {
  if (data && typeof data === "object") {
    const details = (data as Record<string, unknown>).details as
      | Array<{ issue?: string; description?: string }>
      | undefined;
    const first = details?.[0];
    const issue = first ? `${first.issue ?? ""} ${first.description ?? ""}`.trim() : "";
    const name = (data as Record<string, unknown>).name;
    const message = (data as Record<string, unknown>).message;
    return [name, message, issue].filter(Boolean).join(" - ") || `HTTP ${httpStatus ?? "?"}`;
  }
  return `HTTP ${httpStatus ?? "network error"}`;
}

// ---------------------------------------------------------------------------
// Simulated responses (mirror real Orders v2 shapes)
// ---------------------------------------------------------------------------

function simDebug(): string {
  return `PM-SIM-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
}

function simCreateOrder(request: Json): Json {
  const id = rid("SIM-ORDER");
  const pu = (request.purchase_units as Json[])[0] ?? {};
  return {
    id,
    status: "CREATED",
    intent: "AUTHORIZE",
    purchase_units: [{ reference_id: pu.reference_id, amount: pu.amount }],
    links: [
      {
        href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}`,
        rel: "approve",
        method: "GET",
      },
      { href: `/v2/checkout/orders/${id}`, rel: "self", method: "GET" },
      { href: `/v2/checkout/orders/${id}/authorize`, rel: "authorize", method: "POST" },
    ],
    create_time: nowIso(),
  };
}

function simAuthorize(orderId: string, amountCents: number, currency: string): Json {
  const authId = rid("SIM-AUTH");
  return {
    id: orderId,
    status: "COMPLETED",
    payer: {
      name: { given_name: "Demo", surname: "Buyer" },
      email_address: "demo-buyer@switchcart.example",
    },
    purchase_units: [
      {
        payments: {
          authorizations: [
            {
              id: authId,
              status: "CREATED",
              amount: { currency_code: currency, value: centsToApiValue(amountCents) },
              create_time: nowIso(),
              // PayPal authorizations are valid for 3 days (honor period 29 days).
              expiration_time: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
              seller_protection: { status: "ELIGIBLE", dispute_categories: ["ITEM_NOT_RECEIVED"] },
              links: [
                { href: `/v2/payments/authorizations/${authId}/capture`, rel: "capture", method: "POST" },
                { href: `/v2/payments/authorizations/${authId}/void`, rel: "void", method: "POST" },
                { href: `/v2/payments/authorizations/${authId}/reauthorize`, rel: "reauthorize", method: "POST" },
              ],
            },
          ],
        },
      },
    ],
  };
}

function simIssue(action: string, issue: string, description: string): Json {
  return {
    name: "UNPROCESSABLE_ENTITY",
    message: `Simulated ${action} failure (env knob enabled).`,
    details: [{ issue, description }],
    debug_id: simDebug(),
  };
}

// ---------------------------------------------------------------------------
// Public operations
// ---------------------------------------------------------------------------

interface BaseOpts {
  referenceId: string;
  description: string;
  amountCents: number;
  currency: string;
}

export async function ppCreateOrder(o: BaseOpts): Promise<PayPalOpResult> {
  const request: Json = {
    intent: "AUTHORIZE",
    purchase_units: [
      {
        reference_id: o.referenceId,
        custom_id: o.referenceId,
        description: o.description.slice(0, 127),
        amount: {
          currency_code: o.currency,
          value: centsToApiValue(o.amountCents),
          breakdown: {
            item_total: { currency_code: o.currency, value: centsToApiValue(o.amountCents) },
          },
        },
        items: [
          {
            name: o.description.slice(0, 127),
            quantity: "1",
            sku: o.description.slice(0, 50),
            unit_amount: { currency_code: o.currency, value: centsToApiValue(o.amountCents) },
          },
        ],
      },
    ],
    application_context: {
      brand_name: "SwitchCart Demo Store",
      shipping_preference: "NO_SHIPPING",
      user_action: "CONTINUE",
    },
  };
  const requestId = randomUUID();
  if (PAYPAL_MODE === "simulation") {
    const response = simCreateOrder(request);
    return {
      ok: true, action: "orders.create", httpStatus: 201,
      paypalRequestId: requestId, paypalDebugId: simDebug(),
      request, response, error: null, simulated: true,
    };
  }
  try {
    const r = await callApi("/v2/checkout/orders", { method: "POST", body: request, requestId });
    return {
      ok: r.httpStatus === 201, action: "orders.create", httpStatus: r.httpStatus,
      paypalRequestId: requestId, paypalDebugId: r.debugId,
      request, response: r.data,
      error: r.httpStatus === 201 ? null : describeError(r.data, r.httpStatus),
      simulated: false,
    };
  } catch (e) {
    return {
      ok: false, action: "orders.create", httpStatus: null,
      paypalRequestId: requestId, paypalDebugId: null,
      request, response: null, error: e instanceof Error ? e.message : String(e),
      simulated: false,
    };
  }
}

export async function ppAuthorizeOrder(
  paypalOrderId: string,
  amountCents: number,
  currency: string,
): Promise<PayPalOpResult> {
  const request: Json = { orderId: paypalOrderId };
  const requestId = randomUUID();
  if (PAYPAL_MODE === "simulation") {
    const response = simAuthorize(paypalOrderId, amountCents, currency);
    return {
      ok: true, action: "orders.authorize", httpStatus: 201,
      paypalRequestId: requestId, paypalDebugId: simDebug(),
      request, response, error: null, simulated: true,
    };
  }
  try {
    const r = await callApi(`/v2/checkout/orders/${paypalOrderId}/authorize`, {
      method: "POST", body: {}, requestId,
    });
    return {
      ok: r.httpStatus === 201, action: "orders.authorize", httpStatus: r.httpStatus,
      paypalRequestId: requestId, paypalDebugId: r.debugId,
      request, response: r.data,
      error: r.httpStatus === 201 ? null : describeError(r.data, r.httpStatus),
      simulated: false,
    };
  } catch (e) {
    return {
      ok: false, action: "orders.authorize", httpStatus: null,
      paypalRequestId: requestId, paypalDebugId: null,
      request, response: null, error: e instanceof Error ? e.message : String(e),
      simulated: false,
    };
  }
}

export async function ppCapture(
  authorizationId: string,
  amountCents: number,
  currency: string,
  invoiceId: string,
): Promise<PayPalOpResult> {
  const request: Json = {
    amount: { currency_code: currency, value: centsToApiValue(amountCents) },
    final_capture: true,
    invoice_id: invoiceId.slice(0, 127),
    note_to_payer: "SwitchCart substitution checkout - thank you for your consent.",
  };
  const requestId = randomUUID();
  if (PAYPAL_MODE === "simulation") {
    if (process.env.SIM_FORCE_CAPTURE_FAILURE === "1") {
      const response = simIssue("capture", "SIMULATED_CAPTURE_FAILURE", "Forced capture decline for demo.");
      return {
        ok: false, action: "authorizations.capture", httpStatus: 422,
        paypalRequestId: requestId, paypalDebugId: simDebug(),
        request, response, error: describeError(response, 422), simulated: true,
      };
    }
    const response: Json = {
      id: rid("SIM-CAP"),
      status: "COMPLETED",
      amount: request.amount,
      final_capture: true,
      invoice_id: invoiceId.slice(0, 127),
      create_time: nowIso(),
      update_time: nowIso(),
    };
    return {
      ok: true, action: "authorizations.capture", httpStatus: 201,
      paypalRequestId: requestId, paypalDebugId: simDebug(),
      request, response, error: null, simulated: true,
    };
  }
  try {
    const r = await callApi(`/v2/payments/authorizations/${authorizationId}/capture`, {
      method: "POST", body: request, requestId,
    });
    const ok = r.httpStatus === 201 || r.httpStatus === 200;
    return {
      ok, action: "authorizations.capture",
      httpStatus: r.httpStatus, paypalRequestId: requestId, paypalDebugId: r.debugId,
      request, response: r.data,
      error: ok ? null : describeError(r.data, r.httpStatus),
      simulated: false,
    };
  } catch (e) {
    return {
      ok: false, action: "authorizations.capture", httpStatus: null,
      paypalRequestId: requestId, paypalDebugId: null,
      request, response: null, error: e instanceof Error ? e.message : String(e),
      simulated: false,
    };
  }
}

export async function ppVoid(authorizationId: string): Promise<PayPalOpResult> {
  const request: Json = { authorizationId };
  const requestId = randomUUID();
  if (PAYPAL_MODE === "simulation") {
    return {
      ok: true, action: "authorizations.void", httpStatus: 204,
      paypalRequestId: requestId, paypalDebugId: simDebug(),
      request, response: { status: "VOIDED", authorization_id: authorizationId },
      error: null, simulated: true,
    };
  }
  try {
    const r = await callApi(`/v2/payments/authorizations/${authorizationId}/void`, {
      method: "POST", requestId,
    });
    // PayPal returns 200 (not 204) when Prefer: return=representation is sent; both mean the hold was released.
    // Voiding an already-voided authorization returns 422 PREVIOUSLY_VOIDED - also success (idempotent void).
    const respDetails = (r.data as unknown as { details?: Array<{ issue?: string }> } | null)?.details;
    const previouslyVoided =
      r.httpStatus === 422 &&
      Array.isArray(respDetails) &&
      respDetails.some((d) => d?.issue === "PREVIOUSLY_VOIDED");
    const ok = r.httpStatus === 204 || r.httpStatus === 200 || previouslyVoided;
    return {
      ok, action: "authorizations.void", httpStatus: r.httpStatus,
      paypalRequestId: requestId, paypalDebugId: r.debugId,
      request, response: r.data,
      error: ok ? null : describeError(r.data, r.httpStatus),
      simulated: false,
    };
  } catch (e) {
    return {
      ok: false, action: "authorizations.void", httpStatus: null,
      paypalRequestId: requestId, paypalDebugId: null,
      request, response: null, error: e instanceof Error ? e.message : String(e),
      simulated: false,
    };
  }
}

export async function ppReauthorize(
  authorizationId: string,
  amountCents: number,
  currency: string,
): Promise<PayPalOpResult> {
  const request: Json = {
    amount: { currency_code: currency, value: centsToApiValue(amountCents) },
  };
  const requestId = randomUUID();
  if (PAYPAL_MODE === "simulation") {
    if (process.env.SIM_FORCE_REAUTHORIZE_FAILURE === "1") {
      const response = simIssue(
        "reauthorize",
        "SIMULATED_REAUTHORIZE_FAILURE",
        "Forced reauthorize decline for demo (e.g. over reauthorization limits).",
      );
      return {
        ok: false, action: "authorizations.reauthorize", httpStatus: 422,
        paypalRequestId: requestId, paypalDebugId: simDebug(),
        request, response, error: describeError(response, 422), simulated: true,
      };
    }
    const response: Json = {
      id: authorizationId,
      status: "REAUTHORIZED",
      amount: request.amount,
      update_time: nowIso(),
    };
    return {
      ok: true, action: "authorizations.reauthorize", httpStatus: 201,
      paypalRequestId: requestId, paypalDebugId: simDebug(),
      request, response, error: null, simulated: true,
    };
  }
  try {
    const r = await callApi(`/v2/payments/authorizations/${authorizationId}/reauthorize`, {
      method: "POST", body: request, requestId,
    });
    const ok = r.httpStatus === 201 || r.httpStatus === 200;
    return {
      ok, action: "authorizations.reauthorize", httpStatus: r.httpStatus,
      paypalRequestId: requestId, paypalDebugId: r.debugId,
      request, response: r.data,
      error: ok ? null : describeError(r.data, r.httpStatus),
      simulated: false,
    };
  } catch (e) {
    return {
      ok: false, action: "authorizations.reauthorize", httpStatus: null,
      paypalRequestId: requestId, paypalDebugId: null,
      request, response: null, error: e instanceof Error ? e.message : String(e),
      simulated: false,
    };
  }
}
