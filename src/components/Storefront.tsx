"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRightLeft,
  Ban,
  CheckCircle2,
  PackageX,
  RefreshCcw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import { PREF_COLORS, PREF_TAGS } from "@/data/catalog";
import { fmtDateTime, fmtMoney, shortId } from "@/lib/format";
import type {
  AuditEventDTO,
  ConfigDTO,
  OrderDTO,
  OrderStatus,
  ProductDTO,
} from "@/lib/types";
import { PriceDiff, Spinner, StatusBadge, Stepper, StockBadge, Tile } from "@/components/ui";

const TERMINAL: OrderStatus[] = ["CAPTURED", "VOIDED", "CANCELLED", "ERROR"];
const STEPS = ["Cart", "PayPal", "Stock check", "AI swap", "Consent", "Settled"];

function stepIndex(status?: OrderStatus): number {
  switch (status) {
    case undefined:
      return 0;
    case "CREATED":
    case "PENDING_APPROVAL":
      return 1;
    case "AUTHORIZED":
      return 2;
    case "SUBSTITUTION_NEEDED":
      return 3;
    case "AWAITING_CONSENT":
      return 4;
    case "CAPTURED":
    case "VOIDED":
    case "CANCELLED":
      return 5;
    case "ERROR":
      return 4;
    default:
      return 0;
  }
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function jget<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || `Request failed (HTTP ${r.status})`);
  return j as T;
}

async function jpost<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || `Request failed (HTTP ${r.status})`);
  return j as T;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Script failed to load")));
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Script failed to load"));
    document.body.appendChild(s);
  });
}

type Banner = { kind: "error" | "info" | "ok" | "warn"; text: string } | null;

export default function Storefront() {
  const [config, setConfig] = useState<ConfigDTO | null>(null);
  const [products, setProducts] = useState<ProductDTO[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prefTags, setPrefTags] = useState<string[]>(["wireless"]);
  const [prefColors, setPrefColors] = useState<string[]>([]);
  const [maxDelta, setMaxDelta] = useState<number>(2500);
  const [buyerName, setBuyerName] = useState("Ada Buyer");
  const [buyerEmail, setBuyerEmail] = useState("ada.buyer@switchcart.example");

  const [order, setOrder] = useState<OrderDTO | null>(null);
  const [events, setEvents] = useState<AuditEventDTO[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [simOpen, setSimOpen] = useState(false);
  const [choice, setChoice] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");

  const orderRef = useRef<OrderDTO | null>(null);
  const subRequestedFor = useRef<string | null>(null);
  const sdkRenderedFor = useRef<string | null>(null);
  const sdkContainer = useRef<HTMLDivElement | null>(null);
  const approveBtnRef = useRef<HTMLButtonElement | null>(null);

  orderRef.current = order;
  const selected = products?.find((p) => p.id === selectedId) ?? null;
  const phase: OrderStatus | "IDLE" = order?.status ?? "IDLE";

  // ------------------------------------------------------------- data load
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [cfg, prods] = await Promise.all([
          jget<ConfigDTO>("/api/config"),
          jget<{ products: ProductDTO[] }>("/api/products"),
        ]);
        if (!alive) return;
        setConfig(cfg);
        setProducts(prods.products);
      } catch (e) {
        if (alive) setLoadErr(msg(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Refresh stock badges every few seconds while idle (merchant may toggle)
  useEffect(() => {
    if (order) return;
    const t = setInterval(() => {
      jget<{ products: ProductDTO[] }>("/api/products")
        .then((p) => setProducts(p.products))
        .catch(() => undefined);
    }, 5000);
    return () => clearInterval(t);
  }, [order]);

  // ------------------------------------------------------------- helpers
  const refreshOrder = useCallback(async () => {
    const current = orderRef.current;
    if (!current) return;
    try {
      const { order: o } = await jget<{ order: OrderDTO }>(`/api/orders/${current.id}`);
      setOrder(o);
    } catch {
      /* keep polling */
    }
  }, []);

  const doAuthorize = useCallback(async () => {
    const current = orderRef.current;
    if (!current) return;
    setBusy("authorize");
    setBanner(null);
    try {
      const { order: o } = await jpost<{ order: OrderDTO }>(`/api/orders/${current.id}/authorize`);
      setOrder(o);
      setBanner({
        kind: "ok",
        text: `PayPal authorization ${shortId(o.authorizationId, 18)} created — funds are held, not captured yet.`,
      });
      setAnnounce("Payment authorized.");
    } catch (e) {
      setBanner({ kind: "error", text: msg(e) });
      await refreshOrder();
    } finally {
      setBusy(null);
      setSimOpen(false);
    }
  }, [refreshOrder]);

  // Keep a stable callback for the PayPal SDKButtons
  const doAuthorizeRef = useRef(doAuthorize);
  doAuthorizeRef.current = doAuthorize;

  // ------------------------------------------------------------- polling
  useEffect(() => {
    if (!order || TERMINAL.includes(order.status)) return;
    const t = setInterval(refreshOrder, 2500);
    return () => clearInterval(t);
  }, [order, refreshOrder]);

  // --------------------------------------------- auto AI substitution call
  useEffect(() => {
    if (!order || order.status !== "SUBSTITUTION_NEEDED") return;
    const key = `${order.id}:SUBSTITUTION_NEEDED`;
    if (subRequestedFor.current === key) return;
    subRequestedFor.current = key;
    (async () => {
      setBusy("ai");
      try {
        const { order: o } = await jpost<{ order: OrderDTO }>(`/api/orders/${order.id}/substitute`);
        setOrder(o);
        setAnnounce("AI proposed replacements. Review them and consent or decline.");
      } catch (e) {
        subRequestedFor.current = null;
        setBanner({ kind: "error", text: msg(e) });
        await refreshOrder();
      } finally {
        setBusy(null);
      }
    })();
  }, [order, refreshOrder]);

  // ------------------------------------------------------ sim modal + sdk
  useEffect(() => {
    if (order?.status === "PENDING_APPROVAL" && config?.mode === "simulation") {
      setSimOpen(true);
      const t = setTimeout(() => approveBtnRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
    if (order?.status !== "PENDING_APPROVAL") setSimOpen(false);
  }, [order?.status, config?.mode]);

  useEffect(() => {
    if (!order || order.status !== "PENDING_APPROVAL") return;
    if (config?.mode !== "sandbox" || !config.paypalClientId) return;
    if (sdkRenderedFor.current === order.id) return;
    const orderId = order.paypalOrderId;
    const container = sdkContainer.current;
    if (!orderId || !container) return;
    let cancelled = false;
    (async () => {
      try {
        await loadScript(
          `https://www.paypal.com/sdk/js?client-id=${config.paypalClientId}&intent=authorize&currency=USD`,
        );
        if (cancelled) return;
        const paypal = (window as unknown as {
          paypal?: { Buttons?: (cfg: Record<string, unknown>) => { render: (el: HTMLElement) => void } };
        }).paypal;
        if (!paypal?.Buttons || sdkRenderedFor.current === order.id) return;
        sdkRenderedFor.current = order.id;
        container.innerHTML = "";
        paypal
          .Buttons({
            style: { layout: "vertical", color: "gold", shape: "pill", label: "paypal" },
            createOrder: () => orderId,
            onApprove: async () => {
              await doAuthorizeRef.current();
            },
            onCancel: () =>
              setBanner({ kind: "warn", text: "PayPal popup closed — the authorization was not created. You can try again or cancel below." }),
            onError: (err: unknown) =>
              setBanner({ kind: "error", text: `PayPal error: ${msg(err)}` }),
          })
          .render(container);
      } catch (e) {
        if (!cancelled) setBanner({ kind: "error", text: `Could not load PayPal SDK: ${msg(e)}` });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [order, config]);

  // Escape closes the simulated approval window
  useEffect(() => {
    if (!simOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSimOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [simOpen]);

  // Default consent choice when proposals arrive
  const substitutionId = order?.substitution?.id ?? null;
  useEffect(() => {
    if (!substitutionId) return;
    const s = order?.substitution;
    if (s && s.decision === "pending") setChoice(s.suggestions[0]?.productId ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [substitutionId]);

  // Buyer-visible audit strip
  useEffect(() => {
    if (!order) {
      setEvents([]);
      return;
    }
    jget<{ events: AuditEventDTO[] }>(`/api/audit?orderId=${order.id}&limit=8`)
      .then((r) => setEvents(r.events))
      .catch(() => undefined);
  }, [order]);

  // ------------------------------------------------------------- actions
  const checkout = async () => {
    if (!selectedId || busy) return;
    setBusy("checkout");
    setBanner(null);
    try {
      const { order: o } = await jpost<{ order: OrderDTO }>("/api/orders", {
        productId: selectedId,
        buyerName,
        buyerEmail,
        prefs: { tags: prefTags, colors: prefColors, maxDeltaCents: maxDelta },
      });
      setOrder(o);
      setChoice(null);
      subRequestedFor.current = null;
      setAnnounce("PayPal order created. Approve the payment to continue.");
    } catch (e) {
      setBanner({ kind: "error", text: msg(e) });
    } finally {
      setBusy(null);
    }
  };

  const consent = async (decision: "accept" | "decline" | "cancel") => {
    if (!order || busy) return;
    setBusy("consent");
    setBanner(null);
    try {
      const body: Record<string, unknown> = { decision };
      if (decision === "accept" && order.status === "AWAITING_CONSENT") {
        body.replacementId = choice;
      }
      const { order: o } = await jpost<{ order: OrderDTO }>(`/api/orders/${order.id}/consent`, body);
      setOrder(o);
      setAnnounce(
        o.status === "CAPTURED"
          ? "Payment captured."
          : o.status === "VOIDED"
            ? "Authorization voided."
            : `Order is now ${o.status}.`,
      );
    } catch (e) {
      setBanner({ kind: "error", text: msg(e) });
      await refreshOrder();
    } finally {
      setBusy(null);
    }
  };

  const retrySubstitute = () => {
    subRequestedFor.current = null;
    if (order) setOrder({ ...order }); // retrigger effect
  };

  const reset = () => {
    setOrder(null);
    setEvents([]);
    setChoice(null);
    setBanner(null);
    subRequestedFor.current = null;
    sdkRenderedFor.current = null;
  };

  const toggle = (list: string[], value: string, set: (v: string[]) => void) => {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail);
  const chosenSuggestion = order?.substitution?.suggestions.find((s) => s.productId === choice) ?? null;

  // ================================================================= render
  return (
    <section id="catalog" className="sc-shell store-grid pb-8" aria-label="Demo store">
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>

      {/* ---------------------------------------------------------- catalog */}
      <div>
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="font-display flex items-center gap-2.5 text-xl font-bold tracking-tight md:text-2xl">
            <ShoppingBag size={20} className="text-[var(--gold)]" aria-hidden="true" />
            {config?.merchantName ?? "Loading store..."}
          </h2>
          {config && (
            <span className={`badge ${config.mode === "sandbox" ? "badge-authorized" : "badge-awaiting_consent"}`}>
              <span className="badge-dot" aria-hidden="true" />
              {config.mode === "sandbox" ? "PayPal sandbox live" : "Sandbox simulator"}
            </span>
          )}
        </div>

        {loadErr && (
          <div className="alert alert-error mb-4" role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            Failed to load catalog: {loadErr}
          </div>
        )}

        {!loadErr && !products && (
          <div className="flex items-center gap-3 text-[var(--muted)]" role="status">
            <Spinner large /> Loading catalog...
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {products?.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className="prod-card glass anim-fade-up"
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              aria-pressed={selectedId === p.id}
              disabled={!p.inStock || phase !== "IDLE"}
              onClick={() => {
                setSelectedId(p.id);
                setBanner(null);
              }}
            >
              <Tile icon={p.icon} hue={p.hue} size={30} className="mb-3 h-28 w-full" />
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-display text-[0.95rem] font-semibold leading-snug">{p.name}</p>
                  <p className="mt-0.5 text-xs text-[var(--faint)]">{p.category}</p>
                </div>
                <p className="font-display text-[0.95rem] font-bold text-[var(--gold)]">
                  {fmtMoney(p.priceCents, p.currency)}
                </p>
              </div>
              <div className="mt-2.5 flex items-center justify-between">
                <StockBadge inStock={p.inStock} />
                <span className="text-[0.68rem] text-[var(--faint)]">
                  {p.tags.slice(0, 3).join(" · ")}
                </span>
              </div>
            </button>
          ))}
        </div>

        <div className="alert alert-info mt-6">
          <Sparkles size={16} aria-hidden="true" />
          <span>
            <strong>Demo loop:</strong> check out with PayPal → then open the{" "}
            <Link href="/merchant" className="underline decoration-dotted underline-offset-2">
              merchant dashboard
            </Link>{" "}
            and mark the purchased item unavailable → SwitchCart&apos;s AI proposes replacements with the
            exact price difference → you explicitly accept (capture) or decline (void).
          </span>
        </div>
      </div>

      {/* ---------------------------------------------------------- console */}
      <aside className="glass-strong sticky top-24 p-5 md:p-6" aria-label="Checkout console">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold tracking-tight">Checkout console</h2>
          {order ? (
            <StatusBadge status={order.status} />
          ) : (
            <span className="badge badge-created">
              <span className="badge-dot" aria-hidden="true" /> Ready
            </span>
          )}
        </div>

        <div className="mb-5">
          <Stepper steps={STEPS} active={stepIndex(order?.status)} failed={phase === "ERROR"} />
        </div>

        {banner && (
          <div
            className={`alert mb-4 ${banner.kind === "error" ? "alert-error" : banner.kind === "ok" ? "alert-ok" : banner.kind === "warn" ? "alert-warn" : "alert-info"}`}
            role={banner.kind === "error" ? "alert" : "status"}
          >
            {banner.kind === "error" ? (
              <AlertTriangle size={16} aria-hidden="true" />
            ) : banner.kind === "ok" ? (
              <CheckCircle2 size={16} aria-hidden="true" />
            ) : (
              <Sparkles size={16} aria-hidden="true" />
            )}
            <span>{banner.text}</span>
          </div>
        )}

        {/* ------------------------------------------------ phase: cart */}
        {phase === "IDLE" && (
          <div className="anim-fade-up">
            <div
              className={`glass mb-4 flex items-center gap-3 p-3 ${!selected ? "border-dashed" : ""}`}
            >
              {selected ? (
                <>
                  <Tile icon={selected.icon} hue={selected.hue} size={22} className="h-12 w-12 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{selected.name}</p>
                    <p className="text-xs text-[var(--faint)]">
                      {fmtMoney(selected.priceCents, selected.currency)} · qty 1 · free shipping
                    </p>
                  </div>
                </>
              ) : (
                <p className="py-1 text-sm text-[var(--faint)]">← Pick a product from the catalog</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="field">
                <label htmlFor="buyer-name">Buyer name</label>
                <input
                  id="buyer-name"
                  className="input"
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  autoComplete="name"
                />
              </div>
              <div className="field">
                <label htmlFor="buyer-email">Buyer email</label>
                <input
                  id="buyer-email"
                  className="input"
                  type="email"
                  value={buyerEmail}
                  onChange={(e) => setBuyerEmail(e.target.value)}
                  autoComplete="email"
                  aria-invalid={!emailValid}
                />
              </div>
            </div>

            <fieldset className="mt-4">
              <legend className="mb-2 text-[0.72rem] font-semibold uppercase tracking-wider text-[var(--faint)]">
                Buyer preferences — guide the AI swap
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {PREF_TAGS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="chip"
                    aria-pressed={prefTags.includes(t)}
                    onClick={() => toggle(prefTags, t, setPrefTags)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {PREF_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="chip"
                    aria-pressed={prefColors.includes(c)}
                    onClick={() => toggle(prefColors, c, setPrefColors)}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full border border-white/30"
                      style={{ background: c }}
                      aria-hidden="true"
                    />
                    {c}
                  </button>
                ))}
              </div>
              <div className="mt-4">
                <label htmlFor="max-delta" className="mb-1 block text-xs text-[var(--muted)]">
                  Max extra spend for a replacement:{" "}
                  <strong className="text-[var(--gold)]">{fmtMoney(maxDelta)}</strong>
                </label>
                <input
                  id="max-delta"
                  type="range"
                  min={0}
                  max={5000}
                  step={500}
                  value={maxDelta}
                  onChange={(e) => setMaxDelta(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            </fieldset>

            <button
              type="button"
              className="btn btn-gold btn-block mt-5"
              disabled={!selected || !emailValid || busy !== null}
              onClick={checkout}
            >
              {busy === "checkout" ? <Spinner /> : <Wallet size={17} aria-hidden="true" />}
              {selected
                ? `Check out with PayPal — ${fmtMoney(selected.priceCents, selected.currency)}`
                : "Select a product first"}
            </button>
            <p className="mt-3 text-[0.7rem] leading-relaxed text-[var(--faint)]">
              intent=AUTHORIZE. PayPal holds the funds; nothing is captured until every item is
              confirmed in stock — or you explicitly approve an AI-proposed replacement.
              {config?.mode === "simulation"
                ? " No PayPal keys configured: the built-in sandbox simulator will run the flow."
                : " Real PayPal Sandbox buttons will appear after the order is created."}
            </p>
          </div>
        )}

        {/* --------------------------------------- phase: pending approval */}
        {order?.status === "PENDING_APPROVAL" && (
          <div className="anim-pop">
            {config?.mode === "sandbox" ? (
              <>
                <p className="mb-3 text-sm text-[var(--muted)]">
                  Approve the purchase in the PayPal window. The order is created with{" "}
                  <code className="mono text-xs text-[var(--gold)]">intent=AUTHORIZE</code> — you are
                  not charged yet.
                </p>
                <div ref={sdkContainer} className="min-h-[60px]" />
                {order.paypalOrderId && (
                  <p className="mono mt-2 text-[0.68rem] text-[var(--faint)]">
                    paypal order: {order.paypalOrderId}
                  </p>
                )}
              </>
            ) : (
              <div className="glass flex flex-col items-center gap-3 p-6 text-center">
                <Spinner large />
                <p className="text-sm text-[var(--muted)]">
                  Waiting for approval in the simulated PayPal window...
                </p>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setSimOpen(true)}>
                  Reopen approval window
                </button>
              </div>
            )}
            <button
              type="button"
              className="btn btn-danger btn-sm mt-4"
              disabled={busy !== null}
              onClick={() => consent("cancel")}
            >
              <Ban size={14} aria-hidden="true" /> Cancel checkout
            </button>
          </div>
        )}

        {/* -------------------------------------------- phase: authorized */}
        {order?.status === "AUTHORIZED" && (
          <div className="anim-pop">
            <div className="alert alert-ok mb-4">
              <ShieldCheck size={16} aria-hidden="true" />
              <span>
                <strong>{fmtMoney(order.amountCents, order.currency)}</strong> held on your PayPal
                account. “{order.product.name}” is in stock — capture it now, or void the hold.
              </span>
            </div>
            <dl className="mb-4">
              <div className="kv">
                <dt>Authorization ID</dt>
                <dd>{order.authorizationId}</dd>
              </div>
              <div className="kv">
                <dt>PayPal order</dt>
                <dd>{order.paypalOrderId}</dd>
              </div>
            </dl>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-accept flex-1"
                disabled={busy !== null}
                onClick={() => consent("accept")}
              >
                {busy === "consent" ? <Spinner /> : <CheckCircle2 size={16} aria-hidden="true" />}
                Capture {fmtMoney(order.amountCents, order.currency)}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy !== null}
                onClick={() => consent("decline")}
              >
                <Ban size={15} aria-hidden="true" /> Void
              </button>
            </div>
            <p className="mt-3 text-[0.7rem] text-[var(--faint)]">
              Tip: to see the AI substitution flow, mark this item unavailable in the merchant
              dashboard before capturing.
            </p>
          </div>
        )}

        {/* ------------------------------------- phase: substitution flow */}
        {order?.status === "SUBSTITUTION_NEEDED" && (
          <div className="anim-pop">
            <div className="alert alert-warn mb-4">
              <PackageX size={16} aria-hidden="true" />
              <span>
                <strong>“{order.product.name}” just went out of stock</strong> — after your PayPal
                approval. Your {fmtMoney(order.amountCents, order.currency)} hold is still open and
                uncaptured.
              </span>
            </div>
            {busy === "ai" ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <Spinner large />
                <p className="shimmer-text text-sm font-medium">
                  AI is scanning the catalog for replacements...
                </p>
              </div>
            ) : (
              <button type="button" className="btn btn-primary btn-block" onClick={retrySubstitute}>
                <Sparkles size={16} aria-hidden="true" /> Find replacements
              </button>
            )}
          </div>
        )}

        {/* ------------------------------------------ phase: consent screen */}
        {order?.status === "AWAITING_CONSENT" && order.substitution && (
          <div className="anim-pop">
            <h3 className="font-display mb-1 text-base font-bold">Your item sold out — approve a swap?</h3>
            <p className="mb-3 text-xs text-[var(--muted)]">
              {order.substitution.aiProvider === "ai-api"
                ? `Proposed by AI model ${order.substitution.aiModel ?? ""}`
                : "Proposed by deterministic rules (no AI key configured)"}{" "}
              · nothing changes until you decide.
            </p>

            <div className="glass mb-3 flex items-center gap-3 p-3">
              <Tile icon={order.product.icon} hue={order.product.hue} size={20} className="h-11 w-11 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{order.product.name}</p>
                <p className="text-[0.7rem] text-[var(--red)]">out of stock after approval</p>
              </div>
              <p className="mono text-sm text-[var(--muted)] line-through">
                {fmtMoney(order.amountCents, order.currency)}
              </p>
            </div>

            {order.substitution.suggestions.length > 0 ? (
              <div role="radiogroup" aria-label="Replacement options" className="flex flex-col gap-2.5">
                {order.substitution.suggestions.map((s) => (
                  <button
                    key={s.productId}
                    type="button"
                    role="radio"
                    aria-checked={choice === s.productId}
                    className="opt-card glass"
                    onClick={() => setChoice(s.productId)}
                    onKeyDown={(e) => {
                      if (e.key === " " || e.key === "Enter") {
                        e.preventDefault();
                        setChoice(s.productId);
                      }
                    }}
                  >
                    <Tile icon={s.icon} hue={s.hue} size={22} className="h-14 w-14 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{s.name}</span>
                        <PriceDiff cents={s.diffCents} currency={s.currency} />
                      </span>
                      <span className="mt-0.5 block text-[0.72rem] leading-snug text-[var(--muted)]">
                        {s.rationale}
                      </span>
                      <span className="mt-1 flex items-center gap-2 text-[0.68rem] text-[var(--faint)]">
                        {s.category} · {fmtMoney(s.priceCents, s.currency)} · <StockBadge inStock />
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className={`h-4 w-4 shrink-0 rounded-full border ${
                        choice === s.productId
                          ? "border-[var(--gold)] bg-[radial-gradient(circle,var(--gold)_45%,transparent_50%)]"
                          : "border-[var(--line-strong)]"
                      }`}
                    />
                  </button>
                ))}
              </div>
            ) : (
              <div className="alert alert-warn mb-3">
                <AlertTriangle size={16} aria-hidden="true" />
                No in-stock replacement fits your preferences right now. Declining voids the payment
                — you pay nothing.
              </div>
            )}

            <div className="mt-4 flex flex-col gap-2">
              {chosenSuggestion && (
                <button
                  type="button"
                  className="btn btn-accept btn-block"
                  disabled={busy !== null}
                  onClick={() => consent("accept")}
                >
                  {busy === "consent" ? <Spinner /> : <ArrowRightLeft size={16} aria-hidden="true" />}
                  Accept swap · capture{" "}
                  {fmtMoney(chosenSuggestion.priceCents, chosenSuggestion.currency)}
                </button>
              )}
              <button
                type="button"
                className="btn btn-danger btn-block"
                disabled={busy !== null}
                onClick={() => consent("decline")}
              >
                {busy === "consent" ? <Spinner /> : <Ban size={15} aria-hidden="true" />}
                Decline — void authorization ($0.00 charged)
              </button>
            </div>
            {chosenSuggestion && (
              <p className="mt-3 text-[0.7rem] leading-relaxed text-[var(--faint)]">
                By accepting you explicitly consent to purchase “{chosenSuggestion.name}” for{" "}
                {fmtMoney(chosenSuggestion.priceCents, chosenSuggestion.currency)} (
                {chosenSuggestion.diffCents === 0
                  ? "same price as the original"
                  : chosenSuggestion.diffCents > 0
                    ? `${fmtMoney(chosenSuggestion.diffCents, chosenSuggestion.currency)} more — the authorization will be increased first`
                    : `${fmtMoney(Math.abs(chosenSuggestion.diffCents), chosenSuggestion.currency)} less than authorized`}
                ). Server-side validation happens before any capture.
              </p>
            )}
          </div>
        )}

        {/* ------------------------------------------------ terminal phases */}
        {order?.status === "CAPTURED" && (
          <div className="anim-pop text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-[rgba(61,220,151,0.5)] bg-[rgba(61,220,151,0.12)] text-[var(--mint)]">
              <CheckCircle2 size={30} aria-hidden="true" />
            </div>
            <h3 className="font-display text-xl font-bold">Payment captured</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {order.replacement
                ? `“${order.replacement.name}” replaces “${order.product.name}” with your consent.`
                : `“${order.product.name}” will ship as ordered.`}
            </p>
            <dl className="mt-4 text-left">
              <div className="kv">
                <dt>Captured</dt>
                <dd className="text-[var(--mint)]">{fmtMoney(order.finalAmountCents ?? order.amountCents, order.currency)}</dd>
              </div>
              {order.replacement && (
                <div className="kv">
                  <dt>Price difference</dt>
                  <dd>
                    <PriceDiff
                      cents={(order.finalAmountCents ?? order.amountCents) - order.amountCents}
                      currency={order.currency}
                    />
                  </dd>
                </div>
              )}
              <div className="kv">
                <dt>Capture ID</dt>
                <dd>{order.captureId}</dd>
              </div>
              <div className="kv">
                <dt>Authorization</dt>
                <dd>{order.authorizationId}</dd>
              </div>
              <div className="kv">
                <dt>PayPal order</dt>
                <dd>{order.paypalOrderId}</dd>
              </div>
            </dl>
            <button type="button" className="btn btn-gold btn-block mt-5" onClick={reset}>
              <RefreshCcw size={15} aria-hidden="true" /> Run another demo order
            </button>
          </div>
        )}

        {order?.status === "VOIDED" && (
          <div className="anim-pop text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--panel)] text-[var(--muted)]">
              <Ban size={28} aria-hidden="true" />
            </div>
            <h3 className="font-display text-xl font-bold">Authorization voided</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              The hold on your PayPal account was released. <strong>$0.00</strong> captured.
            </p>
            <dl className="mt-4 text-left">
              <div className="kv">
                <dt>Authorization</dt>
                <dd>{order.authorizationId ?? "none"}</dd>
              </div>
              <div className="kv">
                <dt>PayPal order</dt>
                <dd>{order.paypalOrderId}</dd>
              </div>
            </dl>
            <button type="button" className="btn btn-gold btn-block mt-5" onClick={reset}>
              <RefreshCcw size={15} aria-hidden="true" /> Run another demo order
            </button>
          </div>
        )}

        {order?.status === "CANCELLED" && (
          <div className="anim-pop text-center">
            <h3 className="font-display text-xl font-bold">Checkout cancelled</h3>
            <p className="mt-2 text-sm text-[var(--muted)]">
              You left before approving in PayPal — no authorization was ever created.
            </p>
            <button type="button" className="btn btn-gold btn-block mt-5" onClick={reset}>
              <RefreshCcw size={15} aria-hidden="true" /> Start over
            </button>
          </div>
        )}

        {order?.status === "ERROR" && (
          <div className="anim-pop">
            <div className="alert alert-error mb-4">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>
                <strong>Payment pipeline error.</strong> {order.error}
              </span>
            </div>
            <p className="mb-4 text-sm text-[var(--muted)]">
              {order.authorizationId
                ? "An authorization is still open. You can void it safely — you will be charged nothing."
                : "No authorization is open. You can safely retry the checkout."}
            </p>
            <div className="flex gap-2">
              {order.authorizationId && (
                <button
                  type="button"
                  className="btn btn-danger flex-1"
                  disabled={busy !== null}
                  onClick={() => consent("decline")}
                >
                  {busy === "consent" ? <Spinner /> : <Ban size={15} aria-hidden="true" />}
                  Void authorization
                </button>
              )}
              <button type="button" className="btn btn-ghost" onClick={reset}>
                New order
              </button>
            </div>
          </div>
        )}

        {/* --------------------------------------------------- audit strip */}
        {order && events.length > 0 && (
          <details className="hairline mt-5 pt-4">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-[var(--faint)]">
              Order audit trail ({events.length} shown)
            </summary>
            <ul className="mt-3 flex flex-col gap-2">
              {events.map((ev) => (
                <li key={ev.id} className="flex items-start justify-between gap-2 text-[0.72rem]">
                  <span className="min-w-0">
                    <span className="mono font-semibold text-[var(--text)]">{ev.event}</span>
                    {ev.simulated && (
                      <span className="ml-1.5 rounded bg-[var(--panel-2)] px-1 py-0.5 text-[0.6rem] text-[var(--faint)]">
                        SIM
                      </span>
                    )}
                    <span className="mt-0.5 block truncate text-[var(--faint)]">{ev.message}</span>
                  </span>
                  <span className="shrink-0 text-[var(--faint)]">{fmtDateTime(ev.createdAt)}</span>
                </li>
              ))}
            </ul>
            <Link href="/merchant" className="mt-3 inline-block text-xs text-[var(--azure)] underline decoration-dotted underline-offset-2">
              Full trail with PayPal request/response payloads →
            </Link>
          </details>
        )}
      </aside>

      {/* -------------------------------------------- simulated PayPal modal */}
      {simOpen && order && (
        <div className="modal-overlay" onClick={() => setSimOpen(false)}>
          <div
            className="modal sim-frame glass-strong"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sim-pp-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sim-frame-top">
              <span id="sim-pp-title" className="font-display text-sm font-bold italic tracking-tight">
                PayPal <span className="not-italic opacity-70">Sandbox — simulated</span>
              </span>
              <button
                type="button"
                className="text-white/80 hover:text-white"
                aria-label="Close simulated PayPal window"
                onClick={() => setSimOpen(false)}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="p-6">
              <p className="mb-1 text-xs uppercase tracking-wider text-[var(--faint)]">Logged in as</p>
              <p className="mono text-sm">{buyerEmail}</p>
              <div className="hairline my-4" />
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--muted)]">{order.product.name}</span>
                <span className="font-display text-lg font-bold">
                  {fmtMoney(order.amountCents, order.currency)}
                </span>
              </div>
              <p className="mt-3 rounded-lg border border-[rgba(47,139,255,0.35)] bg-[rgba(47,139,255,0.08)] p-3 text-[0.72rem] leading-relaxed text-[#b9d7ff]">
                intent = AUTHORIZE: this approves a hold of{" "}
                {fmtMoney(order.amountCents, order.currency)}. The merchant captures only after
                every item is confirmed — or after you consent to a replacement.
              </p>
              <div className="mt-5 flex gap-2">
                <button
                  ref={approveBtnRef}
                  type="button"
                  className="btn btn-gold flex-1"
                  disabled={busy !== null}
                  onClick={doAuthorize}
                >
                  {busy === "authorize" ? <Spinner /> : <CheckCircle2 size={16} aria-hidden="true" />}
                  Approve payment
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setSimOpen(false)}
                  disabled={busy !== null}
                >
                  Later
                </button>
              </div>
              <p className="mt-3 text-center text-[0.65rem] text-[var(--faint)]">
                Simulated popup — set PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET for the real sandbox
                Buttons iframe. Every call is logged either way.
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
