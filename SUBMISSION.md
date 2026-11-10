# SwitchCart — Devpost submission kit

Copy-paste fields for the **PayPal AI Hackathon** on Devpost (deadline **13 Nov 2026, 01:30 IST**),
Everything in this file is project metadata — the technical documentation lives in `README.md`.

---

## 1. Push the repo to GitHub — DONE

Repo is live and public: **https://github.com/Pritahi/switchcart**

(Original push instructions kept for reference below; the push itself is complete.)


<details>



```bash
# from the project root (the folder that contains package.json)
git init -b main
git add .
git commit -m "SwitchCart — AI out-of-stock recovery for PayPal checkout"
git remote add origin https://github.com/<your-username>/switchcart.git
git push -u origin main
```

Create the empty repository first at **https://github.com/new** (name: `switchcart`,
Public, no README/license/".gitignore" template — this project already has them).
Verify the push: **https://github.com/<your-username>/switchcart**


</details>

## 2. Deploy a public demo URL — DONE (Vercel, PayPal sandbox live)

Live demo: **https://switchcart-alpha.vercel.app** (health OK, real PayPal sandbox keys,
badge "PAYPAL SANDBOX LIVE", no secrets exposed client-side).

Render/Railway remain documented alternatives below:


**Render (recommended, free):** https://dashboard.render.com/new → *Blueprint* → connect the repo.
`render.yaml` provisions the web service + free Postgres, runs `drizzle-kit push` at build,
and health-checks `/api/health`. Fill the `sync: false` vars (PAYPAL_CLIENT_ID,
PAYPAL_CLIENT_SECRET, AI_API_KEY) afterwards. Result: `https://switchcart.onrender.com`.

**Railway (alternative, free tier):** https://railway.app/new → *Deploy from repo* → add Postgres
plugin → set `DATABASE_URL` + optional keys → run `npx drizzle-kit push` once →
build `npm run build`, start `npm run start`.

Without PayPal keys the demo still runs end-to-end in clearly-labelled simulation mode, so the
public URL is judge-proof even if you skip credentials.

## 3. Record the demo video (required) — IN PROGRESS

Use the **2:30 demo script** at the bottom of `README.md` as the storyboard. Screen-record the
storefront in one window and `/merchant` in another, picture-in-picture or split. Upload to
YouTube (unlisted) or Vimeo and paste the link in Devpost.

## 4. Devpost form fields (suggested copy)

**Project name:** SwitchCart

**Elevator pitch (1 sentence):**
When a product sells out after a buyer already approved PayPal checkout, SwitchCart's AI proposes
in-stock replacements with the exact price difference — and only captures (or voids) the PayPal
authorization once the buyer explicitly consents.

**What inspired you to create this project?**
Inventory is never perfectly synchronized with checkout. Most stores either refund and lose the
sale, or silently swap items and invite chargebacks. PayPal's `intent=AUTHORIZE` flow leaves the
money in a reversible hold, which makes an honest, consent-first recovery possible: the merchant
can still fix the order before anything is actually charged.

**What does your project do?**
1. Buyer checks out with PayPal (`intent=AUTHORIZE` — funds held, not captured).
2. Merchant marks an item unavailable; every open authorization holding it is flagged.
3. An AI engine (OpenAI-compatible, with a deterministic rule-based fallback) proposes 1–2
   in-stock replacements from the seeded catalog, showing the exact price difference and a
   rationale tailored to the buyer's stated preferences.
4. The buyer explicitly accepts or declines. The server re-validates stock and price server-side,
   then captures the adjusted authorization (reauthorizing first when the replacement costs more)
   or voids the hold so the buyer pays $0.00.
5. Every PayPal state change is written to an audit trail with the real `PayPal-Request-Id` and
   `PayPal-Debug-Id` plus full request/response payloads.

**How did you build it?**
Node.js 20 + TypeScript; the backend is a set of Node HTTP route handlers (Next.js App Router)
over PostgreSQL via Drizzle ORM. PayPal integration uses the Orders v2 and Payments v2 REST APIs
(authorize / capture / reauthorize / void) with OAuth2 client-credentials; secrets stay server-side.
Substitution proposals come from an OpenAI-compatible `chat/completions` call (JSON mode) with a
deterministic scorer as fallback, and every substitution records which path produced it. Frontend
is hand-built HTML/CSS/JS (React server components + client hydration), Tailwind CSS v4 design
system, Lucide icons, fully keyboard-operable and screen-reader annotated.

**What challenges did you encounter?**
- Amount trust: prices are never accepted from the client — the server recomputes every delta from
  the database before calling PayPal, and only product IDs from the *pending* proposal are accepted.
- Pricier replacements: PayPal authorizations can be reauthorized within the honor period, so the
  flow reauthorizes to the adjusted amount before capture — and degrades to a recoverable error
  state (with a one-click void) when PayPal declines.
- Demoability without credentials: a deterministic simulator returns sandbox-shaped payloads so the
  whole flow — and its failure modes — is reproducible in any environment.

**What's next?**
PayPal webhooks (`PAYMENT.CAPTURE.COMPLETED`) as the source of truth instead of polling, partial
capture for split shipments, multi-item carts with per-line substitution, real merchant auth on the
dashboard, and A/B telemetry on acceptance rate per proposal strategy.

**Built with (tags):** PayPal Orders v2 API, PayPal Payments v2 API, PayPal JavaScript SDK,
OpenAI-compatible Chat Completions API, Node.js, TypeScript, PostgreSQL, Drizzle ORM, React,
Tailwind CSS.

**API / AI use disclosure** (paste the "AI-use disclosure" section of `README.md`).

---

## 5. Submit-readiness checklist

| Devpost requirement | Status |
| --- | --- |
| Working software (public demo URL) | ✅ live: https://switchcart-alpha.vercel.app (PayPal sandbox live) |
| Source repository (public) | ✅ live: https://github.com/Pritahi/switchcart |
| Video demo (YouTube/Vimeo link) | ⏳ recording in progress — storyboard in `README.md` §2:30 demo script |
| Written description / fields | ✅ copy above |
| Built with tags | ✅ listed above |
| License | ✅ MIT (`LICENSE`) |
| Uses PayPal API | ✅ Orders v2 + Payments v2 (authorize/capture/reauthorize/void), sandbox or simulator |
| AI use disclosed | ✅ `README.md` → "AI-use disclosure" |
| Submission before 13 Nov 2026 01:30 IST | ⏳ Devpost draft `1294254-switchcart` at 3/5 steps; only video URL + final submit remain |
