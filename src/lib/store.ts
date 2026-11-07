import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, merchants, orders, products, substitutions } from "@/db/schema";
import { SEED_MERCHANT, SEED_PRODUCTS } from "@/data/catalog";
import { PAYPAL_MODE, ppAuthorizeOrder, ppCapture, ppCreateOrder, ppReauthorize, ppVoid } from "@/lib/paypal";
import type { PayPalOpResult } from "@/lib/paypal";
import { proposeSubstitutions } from "@/lib/ai";
import type {
  AuditEventDTO,
  BuyerPrefs,
  OrderDTO,
  OrderStatus,
  ProductDTO,
  SuggestionDTO,
  SubstitutionDTO,
} from "@/lib/types";

/**
 * SwitchCart core domain layer. All order state transitions, PayPal calls and
 * AI substitution requests live here; every state change writes an audit event
 * with the real (or simulated) PayPal request/response payloads and IDs.
 */

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type ProductRow = typeof products.$inferSelect;
type OrderRow = typeof orders.$inferSelect;
type SubstitutionRow = typeof substitutions.$inferSelect;
type AuditRow = typeof auditEvents.$inferSelect;

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

let seedPromise: Promise<void> | null = null;

export function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      await db
        .insert(merchants)
        .values({ id: SEED_MERCHANT.id, name: SEED_MERCHANT.name })
        .onConflictDoNothing();
      const existing = await db.select({ id: products.id }).from(products).limit(1);
      if (existing.length === 0) {
        await db.insert(products).values(
          SEED_PRODUCTS.map((p) => ({
            id: p.id,
            merchantId: SEED_MERCHANT.id,
            name: p.name,
            category: p.category,
            description: p.description,
            priceCents: p.priceCents,
            currency: "USD",
            tags: p.tags,
            icon: p.icon,
            hue: p.hue,
            inStock: p.inStock,
          })),
        );
      }
    })().catch((e) => {
      seedPromise = null; // allow retry on next request
      throw e;
    });
  }
  return seedPromise;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function toProductDTO(r: ProductRow): ProductDTO {
  return {
    id: r.id,
    merchantId: r.merchantId,
    name: r.name,
    category: r.category,
    description: r.description,
    priceCents: r.priceCents,
    currency: r.currency,
    tags: r.tags,
    icon: r.icon,
    hue: r.hue,
    inStock: r.inStock,
  };
}

function toSubstitutionDTO(r: SubstitutionRow): SubstitutionDTO {
  return {
    id: r.id,
    orderId: r.orderId,
    decision: r.decision as SubstitutionDTO["decision"],
    suggestions: r.suggestions as unknown as SuggestionDTO[],
    chosenProductId: r.chosenProductId,
    aiProvider: r.aiProvider,
    aiModel: r.aiModel,
    createdAt: r.createdAt.toISOString(),
  };
}

function toAuditDTO(r: AuditRow): AuditEventDTO {
  return {
    id: r.id,
    orderId: r.orderId,
    actor: r.actor,
    event: r.event,
    message: r.message,
    paypalRequestId: r.paypalRequestId,
    paypalDebugId: r.paypalDebugId,
    httpStatus: r.httpStatus,
    simulated: r.simulated,
    request: r.request,
    response: r.response,
    createdAt: r.createdAt.toISOString(),
  };
}

function toOrderDTO(
  o: OrderRow,
  product: ProductRow,
  replacement: ProductRow | null,
  sub: SubstitutionRow | null,
  approveUrl: string | null,
): OrderDTO {
  return {
    id: o.id,
    status: o.status as OrderStatus,
    merchantId: o.merchantId,
    product: toProductDTO(product),
    replacement: replacement ? toProductDTO(replacement) : null,
    buyerName: o.buyerName,
    buyerEmail: o.buyerEmail,
    prefs: o.prefs as unknown as BuyerPrefs,
    currency: o.currency,
    amountCents: o.amountCents,
    finalAmountCents: o.finalAmountCents,
    paypalOrderId: o.paypalOrderId,
    authorizationId: o.authorizationId,
    captureId: o.captureId,
    paypalStatus: o.paypalStatus,
    mode: o.mode as OrderDTO["mode"],
    approveUrl,
    error: o.error,
    substitution: sub ? toSubstitutionDTO(sub) : null,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

interface AuditInput {
  orderId?: string | null;
  actor: "buyer" | "merchant" | "ai" | "system";
  event: string;
  message?: string;
  paypalRequestId?: string | null;
  paypalDebugId?: string | null;
  httpStatus?: number | null;
  simulated?: boolean;
  request?: unknown;
  response?: unknown;
}

async function recordAudit(a: AuditInput): Promise<void> {
  await db.insert(auditEvents).values({
    orderId: a.orderId ?? null,
    actor: a.actor,
    event: a.event,
    message: a.message ?? null,
    paypalRequestId: a.paypalRequestId ?? null,
    paypalDebugId: a.paypalDebugId ?? null,
    httpStatus: a.httpStatus ?? null,
    simulated: a.simulated ?? false,
    request: (a.request ?? null) as Record<string, unknown> | null,
    response: (a.response ?? null) as Record<string, unknown> | null,
  });
}

async function auditPayPal(
  orderId: string,
  actor: AuditInput["actor"],
  okEvent: string,
  failEvent: string,
  res: PayPalOpResult,
  message?: string,
): Promise<void> {
  await recordAudit({
    orderId,
    actor,
    event: res.ok ? okEvent : failEvent,
    message: message ?? (res.ok
      ? `${res.action} succeeded (HTTP ${res.httpStatus})`
      : `${res.action} failed: ${res.error}`),
    paypalRequestId: res.paypalRequestId,
    paypalDebugId: res.paypalDebugId,
    httpStatus: res.httpStatus,
    simulated: res.simulated,
    request: res.request,
    response: res.response,
  });
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

async function getProductRow(id: string): Promise<ProductRow | null> {
  const rows = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return rows[0] ?? null;
}

async function latestSubstitution(orderId: string): Promise<SubstitutionRow | null> {
  const rows = await db
    .select()
    .from(substitutions)
    .where(eq(substitutions.orderId, orderId))
    .orderBy(desc(substitutions.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

async function buildOrderDTO(order: OrderRow): Promise<OrderDTO> {
  const product = await getProductRow(order.productId);
  if (!product) throw new HttpError(500, "PRODUCT_MISSING", "Ordered product no longer exists.");
  const replacement = order.replacementProductId
    ? await getProductRow(order.replacementProductId)
    : null;
  const sub = await latestSubstitution(order.id);
  return toOrderDTO(order, product, replacement, sub, null);
}

async function loadOrder(id: string): Promise<OrderRow> {
  const rows = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  const order = rows[0];
  if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "Order not found.");
  return order;
}

// ---------------------------------------------------------------------------
// Public queries
// ---------------------------------------------------------------------------

export async function listProducts(): Promise<ProductDTO[]> {
  await ensureSeeded();
  const rows = await db.select().from(products).orderBy(products.category, products.priceCents);
  return rows.map(toProductDTO);
}

export async function getOrderDTO(id: string): Promise<OrderDTO> {
  await ensureSeeded();
  return buildOrderDTO(await loadOrder(id));
}

export async function listOrders(): Promise<OrderDTO[]> {
  await ensureSeeded();
  const rows = await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(50);
  const out: OrderDTO[] = [];
  for (const r of rows) out.push(await buildOrderDTO(r));
  return out;
}

export async function listAudit(orderId?: string, limit = 200): Promise<AuditEventDTO[]> {
  await ensureSeeded();
  const base = db.select().from(auditEvents).orderBy(desc(auditEvents.id)).limit(limit);
  const rows = orderId
    ? await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.orderId, orderId))
        .orderBy(desc(auditEvents.id))
        .limit(limit)
    : await base;
  return rows.map(toAuditDTO);
}

// ---------------------------------------------------------------------------
// Merchant: availability
// ---------------------------------------------------------------------------

export async function setProductAvailability(
  productId: string,
  inStock: boolean,
): Promise<{ product: ProductDTO; affectedOrderIds: string[] }> {
  await ensureSeeded();
  const product = await getProductRow(productId);
  if (!product) throw new HttpError(404, "PRODUCT_NOT_FOUND", "Product not found.");

  await db
    .update(products)
    .set({ inStock, updatedAt: new Date() })
    .where(eq(products.id, productId));

  await recordAudit({
    actor: "merchant",
    event: inStock ? "PRODUCT_MARKED_AVAILABLE" : "PRODUCT_MARKED_UNAVAILABLE",
    message: inStock
      ? `Merchant marked "${product.name}" back in stock.`
      : `Merchant marked "${product.name}" unavailable.`,
    request: { productId, inStock },
  });

  const affectedOrderIds: string[] = [];
  if (!inStock) {
    const open = await db
      .select()
      .from(orders)
      .where(and(eq(orders.productId, productId), eq(orders.status, "AUTHORIZED")));
    for (const o of open) {
      await db
        .update(orders)
        .set({ status: "SUBSTITUTION_NEEDED", updatedAt: new Date() })
        .where(eq(orders.id, o.id));
      affectedOrderIds.push(o.id);
      await recordAudit({
        orderId: o.id,
        actor: "system",
        event: "STOCK_GAP_DETECTED",
        message:
          `"${product.name}" went out of stock after PayPal approval. ` +
          `Authorization ${o.authorizationId ?? ""} is still open and NOT captured — substitution required before capture.`,
        request: { productId, authorizationId: o.authorizationId },
      });
    }
  }
  return { product: { ...toProductDTO(product), inStock }, affectedOrderIds };
}

// ---------------------------------------------------------------------------
// Buyer: checkout -> PayPal authorize
// ---------------------------------------------------------------------------

function sanitizePrefs(p: Partial<BuyerPrefs> | undefined): BuyerPrefs {
  const clean = (arr: unknown) =>
    Array.isArray(arr) ? (arr.filter((v) => typeof v === "string") as string[]).slice(0, 12) : [];
  const delta = p?.maxDeltaCents;
  return {
    tags: clean(p?.tags),
    colors: clean(p?.colors),
    maxDeltaCents:
      typeof delta === "number" && Number.isFinite(delta) && delta >= 0
        ? Math.round(delta)
        : null,
  };
}

export async function createCheckoutOrder(input: {
  productId: string;
  buyerName: string;
  buyerEmail: string;
  prefs?: Partial<BuyerPrefs>;
}): Promise<OrderDTO> {
  await ensureSeeded();
  const buyerName = (input.buyerName || "").trim().slice(0, 80) || "Demo Buyer";
  const buyerEmail = (input.buyerEmail || "").trim().slice(0, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) {
    throw new HttpError(422, "INVALID_EMAIL", "A valid buyer email is required.");
  }

  const product = await getProductRow(input.productId);
  if (!product) throw new HttpError(404, "PRODUCT_NOT_FOUND", "Product not found.");
  if (!product.inStock) {
    throw new HttpError(
      409,
      "OUT_OF_STOCK",
      `"${product.name}" is currently unavailable and cannot be checked out.`,
    );
  }

  const prefs = sanitizePrefs(input.prefs);
  const [order] = await db
    .insert(orders)
    .values({
      merchantId: product.merchantId,
      productId: product.id,
      productSnapshot: toProductDTO(product) as unknown as Record<string, unknown>,
      buyerName,
      buyerEmail,
      prefs: prefs as unknown as Record<string, unknown>,
      currency: product.currency,
      amountCents: product.priceCents,
      status: "CREATED",
      mode: PAYPAL_MODE,
    })
    .returning();

  await recordAudit({
    orderId: order.id,
    actor: "buyer",
    event: "ORDER_CREATED",
    message: `Checkout started for "${product.name}".`,
    request: { productId: product.id, buyerEmail, prefs },
  });

  const created = await ppCreateOrder({
    referenceId: order.id,
    description: product.name,
    amountCents: product.priceCents,
    currency: product.currency,
  });
  await auditPayPal(order.id, "system", "PAYPAL_ORDER_CREATED", "PAYPAL_ORDER_CREATE_FAILED", created);

  if (!created.ok) {
    await db
      .update(orders)
      .set({ status: "ERROR", error: `PayPal order creation failed: ${created.error}`, updatedAt: new Date() })
      .where(eq(orders.id, order.id));
    throw new HttpError(502, "PAYPAL_CREATE_FAILED", `PayPal order creation failed: ${created.error}`);
  }

  const paypalOrderId = String((created.response as Record<string, unknown>).id);
  const links = ((created.response as Record<string, unknown>).links ?? []) as Array<{
    rel?: string;
    href?: string;
  }>;
  const approveUrl = links.find((l) => l.rel === "approve")?.href ?? null;

  const [updated] = await db
    .update(orders)
    .set({
      paypalOrderId,
      status: "PENDING_APPROVAL",
      paypalStatus: "CREATED",
      updatedAt: new Date(),
    })
    .where(eq(orders.id, order.id))
    .returning();

  const dto = await buildOrderDTO(updated);
  dto.approveUrl = approveUrl;
  return dto;
}

export async function authorizeOrder(id: string): Promise<OrderDTO> {
  await ensureSeeded();
  const order = await loadOrder(id);

  if (order.status === "AUTHORIZED" || order.status === "SUBSTITUTION_NEEDED") {
    return buildOrderDTO(order); // idempotent: already authorized
  }
  if (order.status !== "PENDING_APPROVAL" || !order.paypalOrderId) {
    throw new HttpError(
      409,
      "INVALID_STATE",
      `Order is ${order.status}; it cannot be authorized now.`,
    );
  }

  const res = await ppAuthorizeOrder(order.paypalOrderId, order.amountCents, order.currency);
  await auditPayPal(order.id, "buyer", "PAYPAL_AUTHORIZED", "PAYPAL_AUTHORIZE_FAILED", res,
    res.ok ? "Buyer approved the checkout; PayPal authorization created (funds held, not captured)." : undefined);

  if (!res.ok) {
    await db
      .update(orders)
      .set({ status: "ERROR", error: `PayPal authorize failed: ${res.error}`, updatedAt: new Date() })
      .where(eq(orders.id, order.id));
    throw new HttpError(502, "PAYPAL_AUTHORIZE_FAILED", `PayPal authorize failed: ${res.error}`);
  }

  const pus = ((res.response as Record<string, unknown>).purchase_units ?? []) as Array<
    Record<string, unknown>
  >;
  const payments = (pus[0]?.payments ?? {}) as Record<string, unknown>;
  const auths = (payments.authorizations ?? []) as Array<Record<string, unknown>>;
  const auth = auths[0];
  const authorizationId = auth?.id ? String(auth.id) : null;
  if (!authorizationId) {
    await db
      .update(orders)
      .set({ status: "ERROR", error: "Authorize response contained no authorization id.", updatedAt: new Date() })
      .where(eq(orders.id, order.id));
    throw new HttpError(502, "NO_AUTHORIZATION_ID", "Authorize response contained no authorization id.");
  }

  let nextStatus: OrderStatus = "AUTHORIZED";
  const product = await getProductRow(order.productId);
  if (product && !product.inStock) nextStatus = "SUBSTITUTION_NEEDED";

  const [updated] = await db
    .update(orders)
    .set({
      authorizationId,
      paypalStatus: String(auth?.status ?? "CREATED"),
      status: nextStatus,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, order.id))
    .returning();

  if (nextStatus === "SUBSTITUTION_NEEDED") {
    await recordAudit({
      orderId: id,
      actor: "system",
      event: "STOCK_GAP_DETECTED",
      message:
        `"${product?.name ?? order.productId}" is already unavailable. ` +
        `Authorization ${authorizationId} is open — substitution required before capture.`,
      request: { productId: order.productId, authorizationId },
    });
  }

  return buildOrderDTO(updated);
}

// ---------------------------------------------------------------------------
// AI substitution
// ---------------------------------------------------------------------------

export async function requestSubstitution(id: string): Promise<OrderDTO> {
  await ensureSeeded();
  const order = await loadOrder(id);

  if (order.status === "AWAITING_CONSENT") {
    const existing = await latestSubstitution(order.id);
    if (existing && existing.decision === "pending") return buildOrderDTO(order);
  }
  if (order.status !== "SUBSTITUTION_NEEDED") {
    if (order.status === "AUTHORIZED") {
      throw new HttpError(409, "NOT_NEEDED", "The ordered item is still in stock — no substitution needed.");
    }
    throw new HttpError(
      409,
      "INVALID_STATE",
      `Order is ${order.status}; substitutions are only offered while a stock gap is open.`,
    );
  }
  if (!order.authorizationId) {
    throw new HttpError(409, "NO_AUTHORIZATION", "Order has no open PayPal authorization.");
  }

  const original = await getProductRow(order.productId);
  if (!original) throw new HttpError(500, "PRODUCT_MISSING", "Ordered product no longer exists.");

  const all = await db.select().from(products);
  const candidateRows = all.filter(
    (p) => p.merchantId === order.merchantId && p.inStock && p.id !== order.productId,
  );
  const originalDto = toProductDTO(original);
  const candidateDtos = candidateRows.map(toProductDTO);
  const prefs = order.prefs as unknown as BuyerPrefs;

  const outcome = await proposeSubstitutions(originalDto, candidateDtos, prefs);

  await db.insert(substitutions).values({
    orderId: order.id,
    originalProductId: order.productId,
    suggestions: outcome.suggestions as unknown as Record<string, unknown>[],
    aiProvider: outcome.provider,
    aiModel: outcome.model,
    aiRaw: outcome.raw,
    decision: "pending",
  });

  await recordAudit({
    orderId: order.id,
    actor: "ai",
    event: "AI_SUGGESTION_CREATED",
    message:
      outcome.suggestions.length > 0
        ? `${outcome.suggestions.length} replacement proposal(s) generated via ${outcome.provider}${outcome.model ? ` (${outcome.model})` : ""}.`
        : `No in-stock replacement could be proposed (${outcome.provider}). Buyer may only decline.`,
    request: {
      original: { id: original.id, name: original.name, priceCents: original.priceCents },
      prefs,
      candidates: candidateDtos.map((c) => ({ id: c.id, name: c.name, priceCents: c.priceCents })),
    },
    response: { provider: outcome.provider, model: outcome.model, raw: outcome.raw, suggestions: outcome.suggestions },
  });

  const [updated] = await db
    .update(orders)
    .set({ status: "AWAITING_CONSENT", updatedAt: new Date() })
    .where(eq(orders.id, order.id))
    .returning();

  return buildOrderDTO(updated);
}

// ---------------------------------------------------------------------------
// Buyer consent -> capture / reauthorize+capture / void
// ---------------------------------------------------------------------------

export async function submitConsent(
  id: string,
  input: { decision: "accept" | "decline" | "cancel"; replacementId?: string },
): Promise<OrderDTO> {
  await ensureSeeded();
  const order = await loadOrder(id);

  // Buyer abandons during PayPal approval popup: nothing was authorized yet.
  if (input.decision === "cancel") {
    if (!["CREATED", "PENDING_APPROVAL"].includes(order.status)) {
      throw new HttpError(409, "INVALID_STATE", `Order is ${order.status}; it can no longer be cancelled.`);
    }
    await db
      .update(orders)
      .set({ status: "CANCELLED", updatedAt: new Date() })
      .where(eq(orders.id, order.id));
    await recordAudit({
      orderId: order.id,
      actor: "buyer",
      event: "ORDER_CANCELLED",
      message: "Buyer cancelled before PayPal approval. No funds were authorized.",
    });
    return buildOrderDTO({ ...order, status: "CANCELLED" });
  }

  // Recovery path: a PayPal call failed (capture/reauthorize) while an
  // authorization is still open — the buyer may void it to end cleanly.
  if (input.decision === "decline" && order.status === "ERROR" && order.authorizationId) {
    const v = await ppVoid(order.authorizationId);
    await auditPayPal(order.id, "system", "PAYPAL_AUTH_VOIDED", "PAYPAL_VOID_FAILED", v,
      v.ok ? "Recovered from error state — authorization voided, buyer charged nothing." : undefined);
    if (!v.ok) {
      throw new HttpError(502, "PAYPAL_VOID_FAILED", `PayPal void failed again: ${v.error}`);
    }
    const [updated] = await db
      .update(orders)
      .set({ status: "VOIDED", paypalStatus: "VOIDED", error: null, updatedAt: new Date() })
      .where(eq(orders.id, order.id))
      .returning();
    return buildOrderDTO(updated);
  }

  // Happy path: item stayed in stock — capture the authorization as approved,
  // or let the buyer cancel (void) before capture.
  if (order.status === "AUTHORIZED") {
    if (!order.authorizationId) {
      throw new HttpError(409, "NO_AUTHORIZATION", "Order has no open PayPal authorization.");
    }
    if (input.decision === "decline") {
      await recordAudit({
        orderId: order.id,
        actor: "buyer",
        event: "CONSENT_DECLINED",
        message: "Buyer cancelled the order after approval — voiding the authorization.",
      });
      const v = await ppVoid(order.authorizationId);
      await auditPayPal(order.id, "system", "PAYPAL_AUTH_VOIDED", "PAYPAL_VOID_FAILED", v);
      if (!v.ok) {
        await db
          .update(orders)
          .set({ status: "ERROR", error: `PayPal void failed: ${v.error}`, updatedAt: new Date() })
          .where(eq(orders.id, order.id));
        throw new HttpError(502, "PAYPAL_VOID_FAILED", `PayPal void failed: ${v.error}`);
      }
      const [updated] = await db
        .update(orders)
        .set({ status: "VOIDED", paypalStatus: "VOIDED", updatedAt: new Date() })
        .where(eq(orders.id, order.id))
        .returning();
      return buildOrderDTO(updated);
    }
    // accept with no replacementId (or the original product) -> capture as authorized
    if (input.replacementId && input.replacementId !== order.productId) {
      throw new HttpError(
        422,
        "REPLACEMENT_NOT_OFFERED",
        "The ordered item is in stock — accepting a replacement requires a pending substitution.",
      );
    }
    await recordAudit({
      orderId: order.id,
      actor: "buyer",
      event: "CONSENT_ACCEPTED",
      message: "Item stayed in stock — capturing the PayPal authorization exactly as approved.",
    });
    const cap = await ppCapture(
      order.authorizationId,
      order.amountCents,
      order.currency,
      `SWITCHCART-${order.id}`,
    );
    await auditPayPal(order.id, "system", "PAYPAL_CAPTURED", "PAYPAL_CAPTURE_FAILED", cap,
      cap.ok ? `Captured $${(order.amountCents / 100).toFixed(2)} ${order.currency} — no substitution required.` : undefined);
    if (!cap.ok) {
      await db
        .update(orders)
        .set({ status: "ERROR", error: `PayPal capture failed: ${cap.error}`, updatedAt: new Date() })
        .where(eq(orders.id, order.id));
      throw new HttpError(502, "PAYPAL_CAPTURE_FAILED", `PayPal capture failed: ${cap.error}`);
    }
    const captureId = (cap.response as Record<string, unknown> | null)?.id ?? null;
    const [updated] = await db
      .update(orders)
      .set({
        status: "CAPTURED",
        paypalStatus: "COMPLETED",
        finalAmountCents: order.amountCents,
        captureId: captureId ? String(captureId) : null,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id))
      .returning();
    return buildOrderDTO(updated);
  }

  if (order.status !== "AWAITING_CONSENT") {
    throw new HttpError(
      409,
      "INVALID_STATE",
      `Order is ${order.status}; no consent decision is pending.`,
    );
  }
  const sub = await latestSubstitution(order.id);
  if (!sub || sub.decision !== "pending") {
    throw new HttpError(409, "NO_PENDING_SUBSTITUTION", "No pending substitution to decide on.");
  }

  // ---- DECLINE: void the open authorization --------------------------
  if (input.decision === "decline") {
    await recordAudit({
      orderId: order.id,
      actor: "buyer",
      event: "CONSENT_DECLINED",
      message: "Buyer declined all replacements — the PayPal authorization will be voided; nothing is charged.",
    });

    if (order.authorizationId) {
      const v = await ppVoid(order.authorizationId);
      await auditPayPal(order.id, "system", "PAYPAL_AUTH_VOIDED", "PAYPAL_VOID_FAILED", v,
        v.ok ? "Authorization voided — the hold on buyer funds is released." : undefined);
      if (!v.ok) {
        await db
          .update(orders)
          .set({ status: "ERROR", error: `PayPal void failed: ${v.error}`, updatedAt: new Date() })
          .where(eq(orders.id, order.id));
        throw new HttpError(502, "PAYPAL_VOID_FAILED", `PayPal void failed: ${v.error}`);
      }
    }

    await db
      .update(substitutions)
      .set({ decision: "declined", decidedAt: new Date() })
      .where(eq(substitutions.id, sub.id));
    const [updated] = await db
      .update(orders)
      .set({ status: "VOIDED", paypalStatus: "VOIDED", updatedAt: new Date() })
      .where(eq(orders.id, order.id))
      .returning();
    return buildOrderDTO(updated);
  }

  // ---- ACCEPT -----------------------------------------------
  const replacementId = (input.replacementId || "").trim();
  if (!replacementId) {
    throw new HttpError(422, "REPLACEMENT_REQUIRED", "Choose one proposed replacement or decline instead.");
  }
  const offered = (sub.suggestions as unknown as SuggestionDTO[]).find(
    (s) => s.productId === replacementId,
  );
  if (!offered) {
    throw new HttpError(
      422,
      "REPLACEMENT_NOT_OFFERED",
      "The chosen product was not among the AI proposals for this order.",
    );
  }
  const replacement = await getProductRow(replacementId);
  if (!replacement) throw new HttpError(404, "PRODUCT_NOT_FOUND", "Replacement product not found.");
  if (!replacement.inStock) {
    await db
      .update(substitutions)
      .set({ decision: "expired", decidedAt: new Date() })
      .where(eq(substitutions.id, sub.id));
    await db
      .update(orders)
      .set({ status: "SUBSTITUTION_NEEDED", updatedAt: new Date() })
      .where(eq(orders.id, order.id));
    await recordAudit({
      orderId: order.id,
      actor: "system",
      event: "SUBSTITUTION_EXPIRED",
      message: `"${replacement.name}" went out of stock before the buyer consented. New proposals are required.`,
    });
    throw new HttpError(
      409,
      "REPLACEMENT_UNAVAILABLE",
      `"${replacement.name}" is no longer in stock. A new proposal will be generated.`,
    );
  }
  if (!order.authorizationId) {
    throw new HttpError(409, "NO_AUTHORIZATION", "Order has no open PayPal authorization to capture.");
  }

  const finalCents = replacement.priceCents; // server-side source of truth (never trust client)
  const diffCents = finalCents - order.amountCents;

  await recordAudit({
    orderId: order.id,
    actor: "buyer",
    event: "CONSENT_ACCEPTED",
    message: `Buyer explicitly accepted "${replacement.name}" (${diffCents === 0 ? "same price" : diffCents > 0 ? `+$${(diffCents / 100).toFixed(2)}` : `-$${(Math.abs(diffCents) / 100).toFixed(2)}`} vs original).`,
    request: { replacementId, diffCents, authorizedCents: order.amountCents, finalCents },
  });

  let authorizationId = order.authorizationId;

  // Higher price than authorized: reauthorize the open authorization for the
  // adjusted amount (PayPal allows reauthorization within the honor period,
  // typically up to 115% of the original amount), then capture it.
  if (finalCents > order.amountCents) {
    const ra = await ppReauthorize(authorizationId, finalCents, order.currency);
    await auditPayPal(order.id, "system", "PAYPAL_REAUTHORIZED", "PAYPAL_REAUTHORIZE_FAILED", ra,
      ra.ok ? `Authorization increased to $${(finalCents / 100).toFixed(2)} for the chosen replacement.` : undefined);
    if (!ra.ok) {
      await db
        .update(orders)
        .set({
          status: "ERROR",
          error: `Replacement costs more. Reauthorization failed: ${ra.error}`,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));
      throw new HttpError(
        502,
        "PAYPAL_REAUTHORIZE_FAILED",
        "The replacement costs more than the authorized amount and PayPal could not increase the authorization. You can decline all replacements to void the payment instead.",
      );
    }
    const newAuthId = (ra.response as Record<string, unknown> | null)?.id;
    if (typeof newAuthId === "string" && newAuthId && newAuthId !== authorizationId) {
      authorizationId = newAuthId;
      await db.update(orders).set({ authorizationId }).where(eq(orders.id, order.id));
    }
  }

  const cap = await ppCapture(
    authorizationId,
    finalCents,
    order.currency,
    `SWITCHCART-${order.id}`,
  );
  await auditPayPal(order.id, "system", "PAYPAL_CAPTURED", "PAYPAL_CAPTURE_FAILED", cap,
    cap.ok ? `Captured $${(finalCents / 100).toFixed(2)} ${order.currency} with buyer consent.` : undefined);

  if (!cap.ok) {
    await db
      .update(orders)
      .set({ status: "ERROR", error: `PayPal capture failed: ${cap.error}`, updatedAt: new Date() })
      .where(eq(orders.id, order.id));
    throw new HttpError(502, "PAYPAL_CAPTURE_FAILED", `PayPal capture failed: ${cap.error}`);
  }

  const captureId = (cap.response as Record<string, unknown> | null)?.id ?? null;

  await db
    .update(substitutions)
    .set({ decision: "accepted", chosenProductId: replacementId, decidedAt: new Date() })
    .where(eq(substitutions.id, sub.id));
  const [updated] = await db
    .update(orders)
    .set({
      status: "CAPTURED",
      paypalStatus: "COMPLETED",
      finalAmountCents: finalCents,
      replacementProductId: replacementId,
      captureId: captureId ? String(captureId) : null,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, order.id))
    .returning();

  return buildOrderDTO(updated);
}
