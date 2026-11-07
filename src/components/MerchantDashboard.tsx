"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Banknote,
  Ban,
  Boxes,
  FileJson2,
  RefreshCcw,
  ScrollText,
  Sparkles,
  Wallet,
} from "lucide-react";
import { fmtDateTime, fmtMoney, shortId } from "@/lib/format";
import type { AuditEventDTO, OrderDTO, ProductDTO } from "@/lib/types";
import { Spinner, StatusBadge, StockBadge, Tile } from "@/components/ui";

const OPEN_STATUSES = ["AUTHORIZED", "SUBSTITUTION_NEEDED", "AWAITING_CONSENT"];

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function jget<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || `HTTP ${r.status}`);
  return j as T;
}

function dotClass(ev: AuditEventDTO): string {
  if (ev.event.includes("FAILED") || ev.event.includes("ERROR")) return "t-dot t-err";
  if (ev.event.startsWith("AI_")) return "t-dot t-ai";
  if (ev.event.includes("STOCK_GAP") || ev.event.includes("DECLINED") || ev.event.includes("EXPIRED"))
    return "t-dot t-warn";
  if (ev.event.startsWith("PAYPAL_") || ev.event.includes("ACCEPTED") || ev.event.includes("CAPTURED"))
    return "t-dot t-ok";
  return "t-dot t-neutral";
}

export default function MerchantDashboard() {
  const [products, setProducts] = useState<ProductDTO[] | null>(null);
  const [orders, setOrders] = useState<OrderDTO[] | null>(null);
  const [events, setEvents] = useState<AuditEventDTO[] | null>(null);
  const [orderFilter, setOrderFilter] = useState<string>("all");
  const [busyProduct, setBusyProduct] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ kind: "error" | "ok" | "info"; text: string } | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const loadAll = useCallback(async (silent = true, filter = "all") => {
    try {
      const auditUrl =
        filter === "all" ? "/api/audit?limit=120" : `/api/audit?orderId=${filter}&limit=120`;
      const [p, o, a] = await Promise.all([
        jget<{ products: ProductDTO[] }>("/api/products"),
        jget<{ orders: OrderDTO[] }>("/api/orders"),
        jget<{ events: AuditEventDTO[] }>(auditUrl),
      ]);
      setProducts(p.products);
      setOrders(o.orders);
      setEvents(a.events);
      setLastSync(new Date());
      if (!silent) setBanner({ kind: "ok", text: "Dashboard refreshed." });
    } catch (e) {
      setBanner({ kind: "error", text: `Refresh failed: ${msg(e)}` });
    }
  }, []);

  useEffect(() => {
    void loadAll(true, orderFilter);
    const t = setInterval(() => void loadAll(true, orderFilter), 3500);
    return () => clearInterval(t);
  }, [loadAll, orderFilter]);

  const toggleStock = async (p: ProductDTO) => {
    if (busyProduct) return;
    setBusyProduct(p.id);
    setBanner(null);
    try {
      const r = await fetch(`/api/merchant/products/${p.id}/availability`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inStock: !p.inStock }),
      });
      const j = (await r.json()) as { error?: string; affectedOrderIds?: string[] };
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      const n = j.affectedOrderIds?.length ?? 0;
      setBanner(
        p.inStock
          ? {
              kind: "info",
              text:
                n > 0
                  ? `"${p.name}" marked unavailable — ${n} open authorization${n > 1 ? "s" : ""} flagged for AI substitution. The buyer will be asked to consent or decline.`
                  : `"${p.name}" marked unavailable. No open authorizations are affected yet.`,
            }
          : { kind: "ok", text: `"${p.name}" is back in stock.` },
      );
      await loadAll(true, orderFilter);
    } catch (e) {
      setBanner({ kind: "error", text: msg(e) });
    } finally {
      setBusyProduct(null);
    }
  };

  const stats = useMemo(() => {
    const list = orders ?? [];
    const open = list.filter((o) => OPEN_STATUSES.includes(o.status));
    const captured = list.filter((o) => o.status === "CAPTURED");
    return {
      openCount: open.length,
      openCents: open.reduce((s, o) => s + o.amountCents, 0),
      capturedCents: captured.reduce((s, o) => s + (o.finalAmountCents ?? o.amountCents), 0),
      voidedCount: list.filter((o) => o.status === "VOIDED" || o.status === "CANCELLED").length,
      oosCount: (products ?? []).filter((p) => !p.inStock).length,
    };
  }, [orders, products]);

  return (
    <div className="flex flex-col gap-6">
      {banner && (
        <div
          className={`alert ${banner.kind === "error" ? "alert-error" : banner.kind === "ok" ? "alert-ok" : "alert-info"}`}
          role={banner.kind === "error" ? "alert" : "status"}
        >
          {banner.kind === "error" ? (
            <AlertTriangle size={16} aria-hidden="true" />
          ) : (
            <Sparkles size={16} aria-hidden="true" />
          )}
          <span>{banner.text}</span>
        </div>
      )}

      {/* ---------------------------------------------------------- stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            icon: Wallet,
            label: "Open authorizations",
            value: String(stats.openCount),
            sub: `${fmtMoney(stats.openCents)} held, uncaptured`,
            hue: "text-[var(--azure)]",
          },
          {
            icon: Banknote,
            label: "Captured (consented)",
            value: fmtMoney(stats.capturedCents),
            sub: "settled into the merchant account",
            hue: "text-[var(--mint)]",
          },
          {
            icon: Ban,
            label: "Voided / cancelled",
            value: String(stats.voidedCount),
            sub: "holds released, $0 charged",
            hue: "text-[var(--muted)]",
          },
          {
            icon: Boxes,
            label: "Out of stock",
            value: String(stats.oosCount),
            sub: "toggle inventory below",
            hue: "text-[var(--red)]",
          },
        ].map((s) => (
          <div key={s.label} className="glass anim-fade-up p-5">
            <div className="flex items-center justify-between">
              <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-[var(--faint)]">
                {s.label}
              </p>
              <s.icon size={17} className={s.hue} aria-hidden="true" />
            </div>
            <p className="font-display mt-2 text-2xl font-bold tracking-tight">{s.value}</p>
            <p className="mt-0.5 text-xs text-[var(--faint)]">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* ----------------------------------------------------- inventory */}
        <section className="glass-strong p-5" aria-labelledby="inv-heading">
          <h2 id="inv-heading" className="font-display mb-1 flex items-center gap-2 text-lg font-bold">
            <Boxes size={18} className="text-[var(--gold)]" aria-hidden="true" />
            Inventory — mark items unavailable
          </h2>
          <p className="mb-4 text-xs leading-relaxed text-[var(--muted)]">
            Toggling a product off instantly flags every open PayPal authorization holding it as
            substitution-needed. This is the trigger of the whole SwitchCart flow.
          </p>
          {!products ? (
            <div className="flex items-center gap-3 text-[var(--muted)]">
              <Spinner /> Loading inventory...
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {products.map((p) => (
                <li
                  key={p.id}
                  className="glass flex items-center gap-3 p-3"
                >
                  <Tile icon={p.icon} hue={p.hue} size={18} className="h-10 w-10 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p.name}</p>
                    <p className="mono text-[0.68rem] text-[var(--faint)]">
                      {p.id} · {fmtMoney(p.priceCents, p.currency)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <StockBadge inStock={p.inStock} />
                    <button
                      type="button"
                      role="switch"
                      aria-checked={p.inStock}
                      aria-label={`Toggle availability of ${p.name}`}
                      className="switch"
                      disabled={busyProduct === p.id}
                      onClick={() => void toggleStock(p)}
                    >
                      <span className="track" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* -------------------------------------------------------- orders */}
        <section className="glass-strong p-5" aria-labelledby="orders-heading">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h2 id="orders-heading" className="font-display flex items-center gap-2 text-lg font-bold">
              <Activity size={18} className="text-[var(--azure)]" aria-hidden="true" />
              Orders &amp; PayPal state
            </h2>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void loadAll(false, orderFilter)}
              aria-label="Refresh dashboard"
            >
              <RefreshCcw size={14} aria-hidden="true" />
              Refresh
            </button>
          </div>
          <p className="mb-4 text-xs text-[var(--faint)]">
            {lastSync ? `Last sync ${fmtDateTime(lastSync.toISOString())} · auto-refreshing every 3.5s` : "Syncing..."}
          </p>
          {!orders ? (
            <div className="flex items-center gap-3 text-[var(--muted)]">
              <Spinner /> Loading orders...
            </div>
          ) : orders.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--line-strong)] p-6 text-center text-sm text-[var(--faint)]">
              No orders yet. Run a checkout on the{" "}
              <a href="/" className="text-[var(--azure)] underline decoration-dotted underline-offset-2">
                storefront
              </a>
              .
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th scope="col">Order</th>
                    <th scope="col">Product</th>
                    <th scope="col">Amount</th>
                    <th scope="col">Status</th>
                    <th scope="col">
                      <span className="sr-only">Audit</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <span className="mono block text-[0.72rem]">{shortId(o.id, 8)}</span>
                        <span className="block text-[0.68rem] text-[var(--faint)]">
                          {o.buyerEmail}
                        </span>
                      </td>
                      <td className="max-w-[170px]">
                        <span className="block truncate text-sm">{o.product.name}</span>
                        {o.replacement && (
                          <span className="block truncate text-[0.68rem] text-[var(--mint)]">
                            → {o.replacement.name}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="mono text-[0.78rem]">{fmtMoney(o.amountCents, o.currency)}</span>
                        {o.finalAmountCents != null && o.finalAmountCents !== o.amountCents && (
                          <span className="mono block text-[0.68rem] text-[var(--mint)]">
                            captured {fmtMoney(o.finalAmountCents, o.currency)}
                          </span>
                        )}
                      </td>
                      <td>
                        <StatusBadge status={o.status} />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setOrderFilter(o.id)}
                          aria-label={`Show audit trail for order ${shortId(o.id, 8)}`}
                        >
                          <ScrollText size={14} aria-hidden="true" /> Audit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* --------------------------------------------------------- audit */}
      <section className="glass-strong p-5" aria-labelledby="audit-heading">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <h2 id="audit-heading" className="font-display flex items-center gap-2 text-lg font-bold">
            <FileJson2 size={18} className="text-[var(--violet)]" aria-hidden="true" />
            Audit trail — every state change, traceable
          </h2>
          <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <span>Filter</span>
            <select
              className="input max-w-[220px] !py-1.5 text-xs"
              value={orderFilter}
              onChange={(e) => setOrderFilter(e.target.value)}
              aria-label="Filter audit events by order"
            >
              <option value="all">All events</option>
              {(orders ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {shortId(o.id, 8)} · {o.product.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mb-5 text-xs leading-relaxed text-[var(--muted)]">
          Each event stores the PayPal <code className="mono">PayPal-Request-Id</code> we sent and the{" "}
          <code className="mono">PayPal-Debug-Id</code> PayPal returned, plus full request/response
          payloads. Events marked SIM were produced by the deterministic simulator because no sandbox
          keys are configured.
        </p>

        {!events ? (
          <div className="flex items-center gap-3 text-[var(--muted)]">
            <Spinner /> Loading audit trail...
          </div>
        ) : events.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--line-strong)] p-6 text-center text-sm text-[var(--faint)]">
            No events yet for this filter.
          </p>
        ) : (
          <ol className="timeline">
            {events.map((ev) => (
              <li key={ev.id}>
                <span className={dotClass(ev)} aria-hidden="true" />
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="mono text-[0.78rem] font-semibold">{ev.event}</span>
                  <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[0.62rem] uppercase tracking-wider text-[var(--faint)]">
                    {ev.actor}
                  </span>
                  {ev.simulated && (
                    <span className="rounded bg-[var(--panel-2)] px-1.5 py-0.5 text-[0.6rem] font-semibold text-[var(--faint)]">
                      SIM
                    </span>
                  )}
                  {ev.httpStatus != null && (
                    <span
                      className={`mono text-[0.68rem] ${ev.httpStatus < 400 ? "text-[var(--mint)]" : "text-[var(--red)]"}`}
                    >
                      HTTP {ev.httpStatus}
                    </span>
                  )}
                  <span className="text-[0.68rem] text-[var(--faint)]">
                    {fmtDateTime(ev.createdAt)}
                  </span>
                </div>
                {ev.message && (
                  <p className="mt-1 text-[0.78rem] leading-relaxed text-[var(--muted)]">{ev.message}</p>
                )}
                {(ev.paypalRequestId || ev.paypalDebugId) && (
                  <p className="mono mt-1 text-[0.66rem] text-[var(--faint)]">
                    request-id: {ev.paypalRequestId ?? "-"}
                    {ev.paypalDebugId ? ` · debug-id: ${ev.paypalDebugId}` : ""}
                  </p>
                )}
                {(ev.request !== null || ev.response !== null) && (
                  <details className="audit-detail">
                    <summary>
                      <FileJson2 size={12} aria-hidden="true" /> request / response payload
                    </summary>
                    <pre>
                      {JSON.stringify({ request: ev.request, response: ev.response }, null, 2)}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
