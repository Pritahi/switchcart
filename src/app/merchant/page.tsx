import Link from "next/link";
import { ArrowLeft, LayoutDashboard, RefreshCcw } from "lucide-react";
import MerchantDashboard from "@/components/MerchantDashboard";

export const dynamic = "force-dynamic";

export default function MerchantPage() {
  return (
    <>
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
          <nav aria-label="Primary">
            <Link href="/" className="btn btn-ghost btn-sm">
              <ArrowLeft size={15} aria-hidden="true" />
              Back to storefront
            </Link>
          </nav>
        </div>
      </header>

      <main className="sc-shell py-10">
        <div className="anim-fade-up mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display flex items-center gap-3 text-3xl font-bold tracking-tight md:text-4xl">
              <LayoutDashboard className="text-[var(--gold)]" size={30} aria-hidden="true" />
              Merchant dashboard
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
              NOVA Supply Co. — toggle inventory, watch PayPal authorizations flow through the
              substitution state machine, and inspect a tamper-evident audit trail of every
              authorize, capture, reauthorize and void call with real request IDs.
            </p>
          </div>
        </div>
        <MerchantDashboard />
      </main>
    </>
  );
}
