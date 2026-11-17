// /admin?token=...: sessions table, CSV export and a read-only look at the feature flags. Needs ADMIN_TOKEN on
// the server; with it unset the page says admin is off. Never indexed, never cached, never sends a referrer.
import { Download, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatCount, formatDate } from "@/components/depth/format";
import { SiteHeader } from "@/components/depth/SiteHeader";
import { ButtonLink, buttonClass } from "@/components/ui/Button";
import { Footer } from "@/components/ui/Footer";
import { PaperCard } from "@/components/ui/PaperCard";
import { PenCheck } from "@/components/ui/PenCheck";
import { Pill } from "@/components/ui/Pill";
import { StageBackdrop } from "@/components/ui/StageBackdrop";
import { env, features, isLiveLlm } from "@/lib/config";
import { dbKind } from "@/lib/db/client";
import { adminAccess, adminSessions } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <StageBackdrop />
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-20 md:px-8">
        {children}
      </main>
      <Footer />
    </div>
  );
}

function Blocked({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Shell>
      <div className="pt-8 md:pt-16">
        <PaperCard tilt={-0.5} className="max-w-xl space-y-3 p-6 md:p-8">
          <Lock aria-hidden="true" className="size-8" />
          <h1 className="text-h1 leading-tight">{title}</h1>
          <div className="space-y-3 text-ink-notes [&_code]:rounded-inner [&_code]:bg-marker-1 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-ink">{children}</div>
          <ButtonLink href="/" variant="secondary">
            Back to the start
          </ButtonLink>
        </PaperCard>
      </div>
    </Shell>
  );
}

const FLAG_LABEL: Record<"tts" | "multilingual" | "cheers", { name: string; env: string }> = {
  tts: { name: "Narrator voice", env: "FEATURE_TTS" },
  multilingual: { name: "Multilingual mode", env: "FEATURE_MULTILINGUAL" },
  cheers: { name: "Emoji cheers", env: "FEATURE_CHEERS" },
};

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const raw = (await searchParams).token;
  const token = Array.isArray(raw) ? raw[0] : raw;
  const access = adminAccess(token);

  if (access === "disabled") {
    return (
      <Blocked title="Admin is switched off">
        <p>
          This server has no admin token, so the admin page and the CSV export are turned off. To use them, set <code>ADMIN_TOKEN</code> to a long
          random string, restart the server and open <code>/admin?token=</code> followed by that string.
        </p>
      </Blocked>
    );
  }
  if (access === "denied" || !token) {
    return (
      <Blocked title="That admin link doesn't work">
        <p>The token is missing or wrong. Open the page with the admin token from the server settings: <code>/admin?token=…</code></p>
      </Blocked>
    );
  }

  const sessions = await adminSessions();
  const flags = features();
  const e = env();
  const csvHref = `/api/admin/export?token=${encodeURIComponent(token)}`;
  const real = sessions.filter((s) => s.kind === "live").length;

  const settings: { label: string; on?: boolean; value?: string }[] = [
    ...(Object.keys(FLAG_LABEL) as (keyof typeof FLAG_LABEL)[]).map((k) => ({ label: `${FLAG_LABEL[k].name} (${FLAG_LABEL[k].env})`, on: flags[k] })),
    { label: "Realtime transport (REALTIME_MODE)", value: e.REALTIME_MODE },
    { label: "Language models (LLM_MODE)", value: isLiveLlm() ? "live" : "mock" },
    { label: "Idea delivery (INGEST_MODE)", value: e.INGEST_MODE },
    { label: "Database", value: dbKind() === "pg" ? "Postgres" : "PGlite (local)" },
  ];

  return (
    <Shell>
      <header className="flex flex-wrap items-end justify-between gap-4 pt-6 md:pt-12">
        <div>
          <h1 className="text-display leading-tight">Admin</h1>
          <p className="mt-2 max-w-[56ch] text-ink-notes">
            {formatCount(sessions.length)} {sessions.length === 1 ? "show" : "shows"} on record, {formatCount(real)} real and{" "}
            {formatCount(sessions.length - real)} demo. Demo rooms are listed here but never counted on the Impact page.
          </p>
        </div>
        <a href={csvHref} className={buttonClass({ variant: "primary" })}>
          <Download aria-hidden="true" className="size-5" />
          Download CSV
        </a>
      </header>

      <section aria-labelledby="sessions-h" className="mt-10">
        <h2 id="sessions-h" className="font-display text-h3">
          Sessions
        </h2>
        {sessions.length === 0 ? (
          <p className="mt-3 text-ink-notes">No shows yet. They appear here as soon as someone creates one.</p>
        ) : (
          <PaperCard className="mt-4 overflow-x-auto">
            <table className="dp-table dp-table-links min-w-[56rem] text-small">
              <caption className="sr-only">Every show, newest first</caption>
              <thead>
                <tr>
                  <th scope="col" className="px-3 py-3 text-left">Show</th>
                  <th scope="col" className="px-3 py-3 text-left">Kind</th>
                  <th scope="col" className="px-3 py-3 text-left">Status</th>
                  <th scope="col" className="px-3 py-3 text-right">Rounds</th>
                  <th scope="col" className="px-3 py-3 text-right">People</th>
                  <th scope="col" className="px-3 py-3 text-right">Ideas</th>
                  <th scope="col" className="px-3 py-3 text-right">Votes</th>
                  <th scope="col" className="px-3 py-3 text-right">Canon makers</th>
                  <th scope="col" className="px-3 py-3 text-right">Bots</th>
                  <th scope="col" className="px-3 py-3 text-left">Created</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.showId}>
                    <th scope="row" className="max-w-[18rem] px-3 py-3 text-left font-display font-normal">
                      <Link href={`/story/${encodeURIComponent(s.showId)}`} className="break-words underline decoration-ink-faint decoration-2 underline-offset-4 hover:decoration-ink">
                        {s.title}
                      </Link>
                      <span className="block font-mono text-fine text-ink-notes">{s.roomCode}</span>
                    </th>
                    <td className="px-3 py-3">
                      <Pill tone={s.kind === "demo" ? "wild" : "ok"} size="sm">
                        {s.kind === "demo" ? "Demo" : "Live"}
                      </Pill>
                    </td>
                    <td className="px-3 py-3 text-ink-notes">{s.status}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {s.roundsRevealed}/{s.roundsTotal}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatCount(s.realPeople)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatCount(s.realIdeas)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatCount(s.realVotes)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatCount(s.canonMakers)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {s.botPlayers > 0 ? `${s.botPlayers} 🤖 / ${s.botIdeas}` : "0"}
                    </td>
                    <td className="px-3 py-3 text-ink-notes">{formatDate(Date.parse(s.createdAt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PaperCard>
        )}
        <p className="mt-3 max-w-[70ch] text-small text-ink-notes">
          People, ideas, votes and canon makers count real players only. Bots show simulated players and their ideas. Rounds is decided rounds out of the planned
          total.
        </p>
      </section>

      <section aria-labelledby="flags-h" className="mt-12">
        <h2 id="flags-h" className="font-display text-h3">
          Feature flags and modes
        </h2>
        <p className="mt-1 text-ink-notes">Read only. They are set with environment variables on the server.</p>
        <PaperCard as="div" className="mt-4">
          <dl className="divide-y-[1.5px] divide-dashed divide-ink-faint">
            {settings.map((s) => (
              <div key={s.label} className="flex min-h-12 items-center justify-between gap-4 px-4 py-2">
                <dt className="text-small md:text-body">{s.label}</dt>
                <dd>
                  {s.value !== undefined ? (
                    <Pill tone="neutral" size="sm">
                      {s.value}
                    </Pill>
                  ) : (
                    <Pill tone={s.on ? "ok" : "neutral"} size="sm">
                      {s.on ? <PenCheck size={14} seed={s.label} /> : null}
                      {s.on ? "On" : "Off"}
                    </Pill>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </PaperCard>
      </section>
    </Shell>
  );
}
