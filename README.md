# SwitchCart

**AI-powered out-of-stock recovery for PayPal checkout.**
When an item sells out *after* the buyer approved a PayPal payment, SwitchCart's AI proposes 1–2 in-stock replacements from the merchant catalog — with the **exact price difference** — the buyer explicitly **accepts or declines**, and the server then **captures** the open PayPal authorization (adjusted amount, reauthorizing first when the replacement costs more) or **voids** it. Every PayPal state change lands in a tamper-evident **audit trail** with real request/response IDs.

Submission for the **PayPal AI Hackathon** (Devpost — deadline **13 Nov 2026, 01:30 IST**). MIT licensed.

---

## Why this exists

Standard checkouts fail hard when inventory shifts between payment approval and fulfillment: the merchant either eats a refund (and a lost sale) or silently swaps items (and a chargeback). PayPal's `intent=AUTHORIZE` flow creates the perfect window for a consent-first fix — the funds are only *held*, so the server can still decide: capture a different (validated) amount, top it up via reauthorization, or void the hold so the buyer pays exactly **$0.00**.

## Feature checklist

| Requirement | Implementation |
| --- | --- |
| PayPal `intent=AUTHORIZE` checkout | Orders created with `intent: "AUTHORIZE"`, buyer approves via JS SDK popup (or built-in simulator when no keys are configured) |
| AI proposes 1–2 replacements | OpenAI-compatible Chat Completions call seeded with the catalog snapshot, buyer preferences and per-product price deltas; deterministic rule engine as guaranteed fallback |
| Exact price difference | Computed **server-side only** (`replacement.priceCents - authorized.amountCents`), displayed on the consent screen and stored on every suggestion |
| Explicit buyer consent | Radio-choice consent screen; nothing captures or voids without it; decline always voids the authorization |
| Server validates then captures | Server re-checks stock, re-derives the amount, captures `/v2/payments/authorizations/{id}/capture` |
| Reauthorize when higher | Price went up → `POST .../reauthorize` to the adjusted amount (PayPal honor-period rules apply), then capture |
| Void on decline | `POST .../void` releases the hold |
| Seeded catalog + merchant dashboard | 12 products, one demo merchant (`NOVA Supply Co.`); dashboard toggles availability and instantly flags affected open authorizations |
| Buyer consent screen | Accessible modal-free inline screen with price deltas and rationale |
| Audit trail | `audit_events` table: actor, action, `PayPal-Request-Id`, `PayPal-Debug-Id`, HTTP status, full request/response JSON, simulated flag |
| Clear error/failure states | API error codes, retry-safe order state machine, redacted failure banners + recovery actions (e.g. "void the still-open authorization") |
| Accessible UI | Semantic landmarks, `role=switch/radio/dialog`, `aria-live` announcements, focus management, keyboard operable, `prefers-reduced-motion` support |
| Free deploy | `render.yaml` Blueprint (web + free Postgres) and Railway-ready |

## Stack & architecture

- **Node.js 20+ / TypeScript** backend — HTTP API implemented with Next.js App Router **Route Handlers** (the Express-style request/response pattern on Node; all PayPal and AI calls happen server-side so secrets never reach the browser).
- **Frontend:** server-rendered React → plain HTML/CSS/JS in the browser (no heavy client framework runtime beyond React hydration); Tailwind CSS v4 design system; Lucide icons.
- **PostgreSQL + Drizzle ORM** — `merchants`, `products`, `orders`, `substitutions`, `audit_events`.
- **No PayPal keys? No problem.** A deterministic simulator returns sandbox-shaped payloads with `SIM-` prefixed IDs so the entire authorize → AI swap → consent → capture/void flow is demoable offline. Set real sandbox keys and the same code path hits PayPal for real.

```
┌────────────┐   approve    ┌──────────────┐   authorize   ┌────────────────────┐
│   Buyer    ├─────────────►│ PayPal popup ├──────────────►│ POST /orders/:id/  │
└─────┬──────┘              └──────────────┘               │ authorize          │
      │                                                    └─────────┬──────────┘
      │  merchant marks item OOS                                     │ AUTHORIZED
      ▼                                                              ▼
┌──────────────┐   proposals    ┌───────────────┐   consent   ┌────────────────────┐
│   Merchant   ├───────────────►│  AI engine    ├────────────►│ capture (≤ auth)   │
│  dashboard   │                │ (OpenAI /     │             │ reauthorize+capture│
└──────────────┘                │  rule-based)  │  decline    │  (> auth)          │
                                └───────────────├────────────►│ void               │
                                                └─────────────┴─────────┬──────────┘
                                                                        ▼
                                                              audit_events (all IDs)
```

### Order state machine

`CREATED → PENDING_APPROVAL → AUTHORIZED → (stock OK: capture | stock gap: SUBSTITUTION_NEEDED → AWAITING_CONSENT → CAPTURED | VOIDED | ERROR)` — `CANCELLED` only pre-approval, `ERROR` is recoverable (void the open hold).

## Exact external APIs used

| Purpose | Method & endpoint | API version |
| --- | --- | --- |
| OAuth token | `POST {base}/v1/oauth2/token` (`grant_type=client_credentials`) | **v1** |
| Create order | `POST {base}/v2/checkout/orders` (`intent=AUTHORIZE`) | **Orders v2** |
| Buyer approval link | `orders.links[rel=approve]` / JS SDK `intent=authorize` | **Orders v2** |
| Create authorization | `POST {base}/v2/checkout/orders/{orderId}/authorize` | **Orders v2** |
| Capture | `POST {base}/v2/payments/authorizations/{authorizationId}/capture` (`final_capture: true`) | **Payments v2** |
| Void | `POST {base}/v2/payments/authorizations/{authorizationId}/void` | **Payments v2** |
| Reauthorize (pricier swap) | `POST {base}/v2/payments/authorizations/{authorizationId}/reauthorize` | **Payments v2** |
| AI proposals | `POST {AI_BASE_URL}/chat/completions` (OpenAI-compatible, JSON-mode) | Chat Completions |

- Sandbox base URL: `https://api-m.sandbox.paypal.com` (configurable via `PAYPAL_BASE_URL`).
- Every request sends a unique `PayPal-Request-Id` (idempotency) and stores the returned `PayPal-Debug-Id`.
- PayPal authorizations are valid for **3 days** (honor period 29 days). Reauthorization may exceed the original amount within PayPal's limits (up to 115% / $75 during the honor period); if PayPal declines, SwitchCart shows a recoverable error state and offers voiding instead.

## Setup

### 1. Local

```bash
npm install
cp .env.example .env          # fill in whatever you have — everything is optional except DATABASE_URL
createdb app_db               # or point DATABASE_URL at any Postgres
npx drizzle-kit push          # creates tables (catalog seeds itself on first request)
npm run dev                   # or: npm run build && npm run start
```

Open `http://localhost:3000` (storefront) and `http://localhost:3000/merchant` (dashboard).

### 2. PayPal sandbox keys

1. <https://developer.paypal.com/dashboard/> → **Apps & Credentials → Sandbox → Create App**.
2. Copy the **Client ID** and **Secret** into `.env` (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`).
3. The storefront now renders real PayPal Buttons (gold) and pops the real sandbox approval window. Buyer test accounts are listed under *Sandbox → Accounts*.
4. Without keys, the app runs in clearly-labelled **simulation mode**.

### 3. AI key (optional)

Any OpenAI-compatible endpoint works:

```
AI_API_KEY=sk-...
AI_BASE_URL=https://api.openai.com/v1     # Groq/Together/Ollama/... also fine
AI_MODEL=gpt-4o-mini
```

Without it, or if the call fails/times out (20s), proposals come from `switchcart-rules-v1` — a deterministic scorer (category match, tag overlap with buyer preferences, price closeness, max-extra-spend ceiling). The `aiProvider` field on each substitution records exactly which path ran, and the raw model output is kept in the audit payload.

### 4. Deploy

**Render (Blueprint, free):** *New → Blueprint* → select this repo → `render.yaml` provisions the web service **and** a free Postgres, runs `drizzle-kit push` during build, and health-checks `/api/health`. Fill the `sync: false` env vars in the dashboard.

**Railway:** *New Project → Deploy from Repo*; add a Postgres plugin, set `DATABASE_URL` plus the optional PayPal/AI vars, run `npx drizzle-kit push` once (Railway shell or `railway run`), build command `npm run build`, start `npm run start`.

## Internal API reference

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness + DB check |
| `GET` | `/api/config` | Public config: mode (sandbox/simulation), merchant name, AI status |
| `GET` | `/api/products` | Catalog |
| `POST` | `/api/merchant/products/:id/availability` | `{ inStock: boolean }` — flips stock, flags affected authorizations |
| `POST` | `/api/orders` | Create local order + PayPal `intent=AUTHORIZE` order |
| `GET` | `/api/orders` / `/api/orders/:id` | Order(s) with substitution + IDs |
| `POST` | `/api/orders/:id/authorize` | After buyer approval → creates the authorization |
| `POST` | `/api/orders/:id/substitute` | Generate/return AI proposals (idempotent while pending) |
| `POST` | `/api/orders/:id/consent` | `{ decision: "accept" \| "decline" \| "cancel", replacementId? }` → capture / reauthorize+capture / void |
| `GET` | `/api/audit?orderId=` | Audit trail (all or per order) |

## Demo flow ( judges' quick run )

1. **Storefront** — pick *Aurora Wireless Headphones* ($189), set preferences, *Check out with PayPal*.
2. Approve in the PayPal window (real sandbox or simulator). Console shows **Authorization held $189**.
3. In a second tab open **/merchant** and toggle *Aurora* **off** — the open authorization is flagged `SUBSTITUTION_NEEDED`.
4. Back on the storefront: AI proposes e.g. *Studio Buds Pro* (−$60) and *Pulse Speaker* (−$110) with rationale and **exact price differences**.
5. **Accept** one → server validates, (re)authorizes if pricier, **captures** the adjusted amount. Or **Decline** → the authorization is **voided**, buyer charged $0.00.
6. Inspect the **audit trail** on the dashboard — every event with `PayPal-Request-Id`, `PayPal-Debug-Id`, HTTP status, and full request/response payloads.
7. Failure demo: set `SIM_FORCE_CAPTURE_FAILURE=1` (simulation) to watch the capture 422 → recoverable error state → one-click void of the still-open authorization.

## Error & failure states (all recoverable, all audited)

| Failure | Behaviour |
| --- | --- |
| PayPal create/authorize fails | Order → `ERROR` with PayPal's `issue/description`; no funds ever move |
| Capture fails | Order → `ERROR`, authorization stays open, UI offers **void** recovery |
| Reauthorize declined (over limit) | Same as above with explicit guidance to decline/void |
| Replacement goes out of stock before consent | Substitution **expires**, fresh proposals generated (`409 REPLACEMENT_UNAVAILABLE`) |
| Client tries an un-offered replacement | `422 REPLACEMENT_NOT_OFFERED` — server only accepts IDs from the pending proposal |
| AI API down/misconfigured | Transparent fallback to deterministic rules (`aiProvider: rule-fallback`) |
| No fitting replacement | Consent screen offers decline-only; void guarantees $0.00 |

## Accessibility

Semantic `header/main/footer/nav`, labelled form controls, `role=switch` stock toggles, `role=radiogroup/radio` consent options, `role=dialog aria-modal` simulated popup with focus management and `Escape` to close, `aria-live="polite"` status announcements, visible `:focus-visible` rings, AA-contrast palette, `prefers-reduced-motion` honored. Keyboard-only completion of the entire demo flow works end-to-end.

## Security notes

- `PAYPAL_CLIENT_SECRET` / `AI_API_KEY` are only read server-side (`process.env`); the client id is public by PayPal design.
- Amounts are always recomputed server-side from the database; client-sent prices are ignored.
- Idempotency: PayPal calls carry a unique `PayPal-Request-Id`; substitution generation is idempotent while a proposal is pending; authorize is idempotent for already-authorized orders.

## AI-use disclosure

This project was built with AI assistance (code generation, copy drafting, and this README) via an autonomous developer agent, in line with hackathon transparency expectations. At **runtime**, AI is used for product substitution proposals via an OpenAI-compatible Chat Completions API; when no key is configured or the model fails, a fully deterministic rule-based engine (`switchcart-rules-v1`) takes over, and every decision records which path produced it (`aiProvider`, raw output in the audit trail). Buyers always give **explicit consent** before any money is captured, and decline always voids the PayPal hold.

## File tree

```
switchcart/
├── .env.example                              # every env var, commented
├── LICENSE                                   # MIT
├── README.md                                 # this file
├── render.yaml                               # Render Blueprint (web + free Postgres)
├── drizzle.config.ts                         # Drizzle Kit (env-driven DATABASE_URL)
├── next.config.ts · tsconfig.json · package.json · postcss.config.mjs · eslint.config.mjs
└── src/
    ├── data/
    │   └── catalog.ts                        # seeded catalog, one demo merchant
    ├── db/
    │   ├── index.ts                          # pg Pool + Drizzle client
    │   └── schema.ts                         # merchants/products/orders/substitutions/audit_events
    ├── lib/
    │   ├── types.ts                          # shared DTOs (client-safe)
    │   ├── format.ts                         # money/date formatting
    │   ├── paypal.ts                         # PayPal Orders v2 + Payments v2 client (+ simulator)
    │   ├── ai.ts                             # OpenAI-compatible AI + rule-based fallback
    │   └── store.ts                          # order state machine, captures/voids, audit writes
    ├── components/
    │   ├── ui.tsx                            # badges, stepper, tiles, price-diff
    │   ├── Storefront.tsx                    # buyer flow (checkout → consent → receipt)
    │   └── MerchantDashboard.tsx             # inventory toggles, orders, audit timeline
    └── app/
        ├── layout.tsx · globals.css          # fonts, design system
        ├── page.tsx                          # storefront shell
        ├── merchant/page.tsx                 # dashboard shell
        └── api/
            ├── health/route.ts
            ├── config/route.ts
            ├── products/route.ts
            ├── merchant/products/[id]/availability/route.ts
            ├── orders/route.ts
            ├── orders/[id]/route.ts
            ├── orders/[id]/authorize/route.ts
            ├── orders/[id]/substitute/route.ts
            ├── orders/[id]/consent/route.ts
            └── audit/route.ts
```

## 2:30 demo script

| Time | Beat |
| --- | --- |
| **0:00–0:15** | "A buyer approved a PayPal payment — and the item sold out a second later. Normally: refund, lost sale, annoyed customer. SwitchCart turns that window into a save." Show storefront hero + catalog. |
| **0:15–0:35** | Buy the *Aurora Wireless Headphones* ($189). Set preferences (`wireless`, max +$25). Gold PayPal button → approve (real sandbox popup or simulator toggle). Point at console: **"Authorization held — funds locked, not captured."** |
| **0:35–0:55** | Switch to merchant dashboard: "Fulfillment finds zero stock." Toggle Aurora **off**. "Watch the open authorization get flagged instantly." Show order flip to *Substitution needed* in real time. |
| **0:55–1:25** | Back on storefront: AI scans the catalog and proposes two in-stock swaps with rationale and **exact price differences** ("Studio Buds Pro, −$60.00"). Walk through consent copy: nothing happens without explicit buyer consent. |
| **1:25–1:50** | **Accept** → "Server re-validates stock, recomputes the delta, captures the adjusted amount — and if the swap were pricier, it would reauthorize the hold first." Receipt shows capture ID. Then rerun and **Decline** → authorization voided, "$0.00 charged". |
| **1:50–2:15** | Open the audit trail: every PayPal call with `PayPal-Request-Id`, `PayPal-Debug-Id`, HTTP status and full payloads. Mention `SIM_FORCE_CAPTURE_FAILURE=1` → recover the error state by voiding the still-open hold. |
| **2:15–2:30** | Close: "Consent-first substitutions, capture-or-void orchestration on PayPal Orders v2, and a full audit trail — deployable free via render.yaml. MIT licensed. Thank you!" |
