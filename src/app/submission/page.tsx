import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  ArrowLeft, ArrowUpRight, CheckCircle2, CircleAlert, Code2, Download,
  ExternalLink, FileArchive, GitBranch, ShieldCheck, Clock3,
} from "lucide-react";
import { AI_CONFIGURED } from "@/lib/ai";
import { PAYPAL_MODE } from "@/lib/paypal";
import type { ReleaseInfo } from "@/lib/source-archive";

export const dynamic = "force-dynamic";

function configuredGithubUrl(): string | null {
  try {
    const url = new URL(process.env.GITHUB_REPO_URL || "");
    const parts = url.pathname.split("/").filter(Boolean);
    return url.protocol === "https:" && url.hostname === "github.com" && parts.length === 2 && !url.username && !url.password
      ? url.href : null;
  } catch { return null; }
}

async function releaseInfo(): Promise<ReleaseInfo | null> {
  try {
    return JSON.parse(await readFile(path.join(process.cwd(), "public/downloads/release.json"), "utf8")) as ReleaseInfo;
  } catch { return null; }
}

const checklist = [
  ["Prepared", "Complete source, MIT license, environment template and lockfile", "Included in the ZIP; private environment files and generated dependencies are excluded."],
  ["Prepared", "Express backend, PostgreSQL schema, buyer UI and merchant dashboard", "The Express entrypoint shares the same handlers as the preview."],
  ["Action required", "Public GitHub / GitLab / Bitbucket repository", "Publish the extracted project. A local ZIP is not a public repository."],
  ["Action required", "Working PayPal sandbox + AI demonstration", `Current runtime: ${PAYPAL_MODE} PayPal / ${AI_CONFIGURED ? "AI API configured" : "deterministic fallback"}. Add your credentials and verify the real services before recording.`],
  ["Action required", "Public YouTube demo, under three minutes", "Show the running application, real consent, capture/void and audit IDs. Review trademark/music permissions."],
  ["Action required", "Judge access and English testing instructions", "A hosted demo is optional if the public repository lets judges run the app. Keep access available through judging."],
  ["Your confirmation", "Eligibility, ownership, AI disclosure and development-period changes", "Confirm the team’s eligibility and original work; disclose AI assistance and the actual model used."],
  ["Action required", "Submit the entry on Devpost", "Saving a draft is not submitting. Confirm the entry appears in your hackathon submissions."],
];

export default async function SubmissionPage() {
  const [github, release] = await Promise.all([configuredGithubUrl(), releaseInfo()]);
  return (
    <>
      <header className="border-b border-[var(--line)]">
        <div className="sc-shell flex min-h-16 flex-wrap items-center justify-between gap-3 py-3">
          <Link href="/" className="btn btn-ghost btn-sm"><ArrowLeft size={15} aria-hidden="true" /> Storefront</Link>
          <span className="font-display font-bold">Switch<span className="text-[var(--gold)]">Cart</span> / Project release</span>
        </div>
      </header>
      <main className="sc-shell py-12 md:py-16">
        <div className="anim-fade-up max-w-3xl">
          <p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--gold)]"><FileArchive size={16} aria-hidden="true" /> Complete source · MIT licensed</p>
          <h1 className="font-display text-4xl font-bold leading-tight md:text-6xl">Take the whole project with you.</h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--muted)]">Every application source file, full configuration, database schema, tests, deployment files and documentation—organized under a single <code className="mono text-[var(--gold)]">switchcart/</code> directory. No omitted code.</p>
        </div>

        <div className="alert alert-warn mt-8 max-w-4xl" role="status">
          <CircleAlert size={18} aria-hidden="true" />
          <span><strong>Repository-ready is not yet submit-ready.</strong> No public repository, public video or Devpost submission has been created by this workspace. Real PayPal/AI credentials and judge testing are still required for a convincing live submission.</span>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <section className="glass-strong p-6 md:p-8" aria-labelledby="download-title">
            <h2 id="download-title" className="font-display flex items-center gap-2 text-xl font-bold"><Download size={21} className="text-[var(--gold)]" aria-hidden="true" /> Download SwitchCart</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">The static release is prepared with the project. The fresh-download option rebuilds the ZIP from the current allowlisted source.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a className="btn btn-gold" href="/downloads/switchcart-source.zip" download><Download size={17} aria-hidden="true" /> Download full ZIP</a>
              <a className="btn btn-ghost" href="/api/source" download><RefreshIcon /> Fresh ZIP</a>
            </div>
            {release ? (
              <dl className="mt-6">
                <div className="kv"><dt>Complete project files</dt><dd>{release.fileCount}</dd></div>
                <div className="kv"><dt>ZIP size</dt><dd>{(release.zipBytes / 1024).toFixed(1)} KB</dd></div>
                <div className="kv"><dt>ZIP SHA-256</dt><dd className="max-w-[270px]">{release.zipSha256}</dd></div>
              </dl>
            ) : <p className="mt-5 text-xs text-[var(--muted)]">Static release metadata is not present. Use Fresh ZIP, or run the packaging command in the README.</p>}
            <div className="hairline mt-6 pt-5 text-xs leading-relaxed text-[var(--muted)]">
              <p><strong className="text-[var(--text)]">Included:</strong> src/, server/, tests/, scripts/, documentation, CI workflow, package files, deployment configuration, license and a per-file SHA-256 manifest.</p>
              <p className="mt-2"><strong className="text-[var(--text)]">Intentionally excluded:</strong> .env and other private environment files, node_modules/, .next/, Git internals, and previous ZIP artifacts. Dependencies are restored with npm ci.</p>
            </div>
          </section>

          <section className="glass-strong p-6 md:p-8" aria-labelledby="github-title">
            <h2 id="github-title" className="font-display flex items-center gap-2 text-xl font-bold"><GitBranch size={21} className="text-[var(--azure)]" aria-hidden="true" /> GitHub links</h2>
            {github ? (
              <a href={github} target="_blank" rel="noopener noreferrer" className="btn btn-primary mt-5">Configured repository <ExternalLink size={15} aria-hidden="true" /></a>
            ) : (
              <div className="alert alert-info mt-5"><Code2 size={17} aria-hidden="true" /><span><strong>No public repository is published yet.</strong> This sandbox has no GitHub publishing credentials. Create the repository under your own account, then set GITHUB_REPO_URL to its actual HTTPS URL.</span></div>
            )}
            <ol className="mt-5 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-[var(--muted)]">
              <li>Extract the ZIP and open a terminal inside <code className="mono">switchcart/</code>.</li>
              <li>Install and authenticate the GitHub CLI using the link below.</li>
              <li>Review the files, then run:</li>
            </ol>
            <pre className="mono mt-4 overflow-x-auto rounded-xl border border-[var(--line)] bg-[rgba(3,5,10,0.8)] p-4 text-xs leading-7 text-[#b9d7ff]">git init -b main{"\n"}git add .{"\n"}git commit -m &quot;SwitchCart hackathon project&quot;{"\n"}gh repo create switchcart --public --source=. --push</pre>
            <div className="mt-5 flex flex-wrap gap-4 text-sm">
              <a className="inline-flex items-center gap-1 text-[var(--azure)]" href="https://github.com/new" target="_blank" rel="noopener noreferrer">Create on GitHub <ArrowUpRight size={14} aria-hidden="true" /></a>
              <a className="inline-flex items-center gap-1 text-[var(--azure)]" href="https://cli.github.com/" target="_blank" rel="noopener noreferrer">GitHub CLI <ArrowUpRight size={14} aria-hidden="true" /></a>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-[var(--faint)]">The command creates a repository under your authenticated account. If the name already exists, choose a different name. Never commit .env or sandbox secrets.</p>
          </section>
        </div>

        <section className="mt-10" aria-labelledby="checklist-title">
          <h2 id="checklist-title" className="font-display flex items-center gap-2 text-2xl font-bold"><ShieldCheck size={24} className="text-[var(--mint)]" aria-hidden="true" /> Devpost submission checklist</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Based on the official PayPal AI Hackathon listing and rules. Recheck the live rules before entering.</p>
          <div className="glass mt-5 overflow-x-auto">
            <table className="tbl min-w-[680px]">
              <thead><tr><th scope="col">Status</th><th scope="col">Requirement</th><th scope="col">What remains</th></tr></thead>
              <tbody>{checklist.map(([status, requirement, detail]) => (
                <tr key={requirement}>
                  <td><span className={`badge ${status === "Prepared" ? "badge-captured" : "badge-created"}`}>{status === "Prepared" ? <CheckCircle2 size={12} aria-hidden="true" /> : <Clock3 size={12} aria-hidden="true" />}{status}</span></td>
                  <td className="font-medium">{requirement}</td><td className="max-w-md text-[var(--muted)]">{detail}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <section className="glass p-6">
            <h2 className="font-display flex items-center gap-2 text-lg font-bold"><Clock3 size={19} className="text-[var(--gold)]" aria-hidden="true" /> Submission deadline</h2>
            <p className="mt-3 text-sm leading-7 text-[var(--muted)]"><time dateTime="2026-11-13T01:30:00+05:30">13 November 2026 · 01:30 IST</time><br />12 November · 12:00 PST / 15:00 EST / 20:00 UTC.<br />Submit early; do not rely on a last-minute upload.</p>
          </section>
          <section className="glass p-6">
            <h2 className="font-display text-lg font-bold">Official links & deployment</h2>
            <div className="mt-3 flex flex-col items-start gap-3 text-sm text-[var(--azure)]">
              {[
                ["Hackathon overview", "https://paypalaihackathon.devpost.com/"],
                ["Official rules", "https://paypalaihackathon.devpost.com/rules"],
                ["PayPal sandbox credentials", "https://developer.paypal.com/dashboard/"],
                ["Render dashboard", "https://dashboard.render.com/"],
                ["Railway", "https://railway.com/new"],
              ].map(([label, href]) => <a key={href} href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1">{label}<ArrowUpRight size={14} aria-hidden="true" /></a>)}
            </div>
          </section>
        </div>
        <p className="mt-8 max-w-4xl text-xs leading-relaxed text-[var(--faint)]">This is a hackathon prototype, not a production payment system. The ZIP’s SUBMISSION.md and README explain real-sandbox verification, PayPal honor-period restrictions, shared-demo access limitations, payment reconciliation work and video requirements. No acceptance, eligibility or prize outcome is guaranteed.</p>
      </main>
    </>
  );
}

function RefreshIcon() { return <FileArchive size={16} aria-hidden="true" />; }
