import Link from "next/link";
import { ArrowRight, LayoutDashboard, RefreshCcw, ShieldCheck, Sparkles, Vault } from "lucide-react";
import Storefront from "@/components/Storefront";

export const dynamic = "force-dynamic";

function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[rgba(5,7,13,0.78)] backdrop-blur-xl">
      <div className="sc-shell flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 no-underline" aria-label="SwitchCart home">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl text-[#1a1405]"
            style={{ background: "linear-gradient(160deg, #ffc439, #f4b400)" }}
            aria-hidden="true"
          >
            <RefreshCcw size={18} strokeWidth={2.4} />
          </span>
          <span className="font-display text-lg font-bold tracking-tight text-[var(--text)]">
            Switch<span className="text-[var(--gold)]">Cart</span>
          </span>
        </Link>
        <nav className="flex items-center gap-2" aria-label="Primary">
          <span className="badge badge-awaiting_consent mr-1 hidden sm:inline-flex">
            <Sparkles size={12} aria-hidden="true" />
            PayPal AI Hackathon
          </span>
          <Link href="/merchant" className="btn btn-ghost btn-sm">
            <LayoutDashboard size={15} aria-hidden="true" />
            Merchant dashboard
          </Link>
        </nav>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-[var(--line)] py-10">
      <div className="sc-shell flex flex-col gap-4 text-sm text-[var(--faint)] md:flex-row md:items-center md:justify-between">
        <p>
          SwitchCart — AI-powered out-of-stock recovery for PayPal checkout. Demo submission for the
          PayPal AI Hackathon (Devpost, deadline 13 Nov 2026 01:30 IST).
        </p>
        <p className="flex items-center gap-2">
          <ShieldCheck size={15} aria-hidden="true" />
          Explicit buyer consent before capture · Full audit trail · MIT licensed
        </p>
      </div>
    </footer>
  );
}

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        {/* Hero */}
        <section className="sc-shell pt-14 pb-10 md:pt-20 md:pb-14">
          <p className="anim-fade-up mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--line-strong)] bg-[var(--panel)] px-4 py-1.5 text-xs font-medium tracking-wide text-[var(--muted)]">
            <Vault size={13} className="text-[var(--gold)]" aria-hidden="true" />
            Authorize first. Substitute with consent. Capture only what the buyer agreed to.
          </p>
          <h1
            className="anim-fade-up font-display max-w-4xl text-4xl leading-[1.04] font-bold tracking-tight md:text-6xl"
            style={{ animationDelay: "80ms" }}
          >
            An item went out of stock.{" "}
            <span
              className="text-transparent"
              style={{
                backgroundImage: "linear-gradient(100deg, #ffc439 10%, #2f8bff 60%, #3ddc97)",
                backgroundClip: "text",
                WebkitBackgroundClip: "text",
              }}
            >
              The sale didn&apos;t die.
            </span>
          </h1>
          <p
            className="anim-fade-up mt-5 max-w-2xl text-base leading-relaxed text-[var(--muted)] md:text-lg"
            style={{ animationDelay: "160ms" }}
          >
            SwitchCart holds the buyer&apos;s PayPal <strong className="text-[var(--text)]">authorization</strong>,
            proposes in-stock replacements with the <strong className="text-[var(--text)]">exact price difference</strong>,
            waits for explicit consent, then <strong className="text-[var(--text)]">captures</strong> the adjusted
            amount — or <strong className="text-[var(--text)]">voids</strong> the hold entirely. Every PayPal state
            change is audited with real request IDs.
          </p>
          <div className="anim-fade-up mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: "240ms" }}>
            <a href="#catalog" className="btn btn-gold">
              Shop the demo catalog
              <ArrowRight size={16} aria-hidden="true" />
            </a>
            <Link href="/merchant" className="btn btn-ghost">
              <LayoutDashboard size={16} aria-hidden="true" />
              Open merchant dashboard
            </Link>
          </div>
        </section>

        <Storefront />
      </main>
      <SiteFooter />
    </>
  );
}
