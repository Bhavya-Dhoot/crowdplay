// /impact: what real people have actually done on this deployment. Every number is counted from the
// database on request (cached for a minute): no bots, no demo rooms, nothing estimated. With no real usage
// yet the page says so instead of showing made-up figures.
import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatCount, formatDate, formatPercent, formatSeconds, formatTimeUtc } from "@/components/depth/format";
import { SiteHeader } from "@/components/depth/SiteHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Footer } from "@/components/ui/Footer";
import { Pill } from "@/components/ui/Pill";
import { getImpact } from "@/lib/metrics";

export const dynamic = "force-dynamic";

const DESCRIPTION = "Real people, real shows, counted straight from the database. Bots and demo rooms are never included.";

export const metadata: Metadata = {
  title: "Impact",
  description: DESCRIPTION,
  openGraph: { title: "CrowdPlay impact", description: DESCRIPTION },
};

const P95_TARGET_MS = 8000;

function Stat({ value, label, note, className, children }: { value: string; label: string; note: string; className?: string; children?: ReactNode }) {
  return (
    <div className={`flex flex-col bg-surface p-5 md:p-6 ${className ?? ""}`}>
      <dt className="order-2 mt-1 font-display text-lg leading-tight">{label}</dt>
      <dd className="order-1 font-display text-5xl leading-none font-extrabold tracking-tight text-accent tabular-nums md:text-6xl">{value}</dd>
      <dd className="order-3 mt-2 text-sm leading-snug text-muted">{note}</dd>
      {children}
    </div>
  );
}

const DEFINITIONS: { term: string; text: string }[] = [
  { term: "Real person", text: "Someone who is not a bot, has not deleted their data, and sent at least one idea or vote in a real show." },
  { term: "Show completed", text: "A real show that reached its finale with at least one round decided and at least one real person in it." },
  { term: "Idea", text: "An idea typed by a real person that passed the filter and was not deleted." },
  { term: "Canon maker", text: "A real person whose idea won a round and who holds the receipt for it." },
  {
    term: "Distill time",
    text: "How long the AI step took to turn a round's ideas into three options. Rounds with no ideas are skipped, because the narrator improvises those instantly and would flatter the numbers.",
  },
  { term: "Excluded everywhere", text: "Bots, demo rooms (including Try it alone), and anyone who deleted their data." },
];

export default async function ImpactPage() {
  const { totals, sessions, generatedAt } = await getImpact();
  const empty = totals.realPeople === 0 && sessions.length === 0;
  const p95Ok = totals.p95DistillMs !== null && totals.p95DistillMs <= P95_TARGET_MS;

  return (
    <div className="stage-light flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-20 md:px-8">
        <header className="pt-6 md:pt-12">
          <h1 className="max-w-[16ch] font-display text-[clamp(2.5rem,9vw,4.5rem)] leading-[0.95] font-extrabold tracking-[-0.04em] text-balance">
            Real shows. Real people.
          </h1>
          <p className="mt-4 max-w-[52ch] text-lg text-muted md:text-xl">
            What people have actually done on CrowdPlay, with nothing added to make it look bigger.
          </p>
          <p className="mt-6 flex items-start gap-3 rounded-card border border-line bg-surface px-4 py-3 md:max-w-fit">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-ok" />
            <span>Bots and demo rooms excluded. Numbers come straight from the database.</span>
          </p>
        </header>

        {empty ? (
          <section aria-labelledby="empty-h" className="mt-10">
            <Card tone="raised" className="p-6 md:p-8">
              <h2 id="empty-h" className="font-display text-3xl leading-tight md:text-4xl">
                No real show has been played yet.
              </h2>
              <p className="mt-3 max-w-[56ch] text-lg text-muted">
                There is nothing to count, so there are no numbers here. Once real people play a show, it appears on this page within a minute.
                Demo rooms and the 60-second try-out use simulated players, so they never show up here.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <ButtonLink href="/host">Host a show</ButtonLink>
                <ButtonLink href="/try" variant="secondary">
                  Try it alone (60 s)
                </ButtonLink>
              </div>
            </Card>
          </section>
        ) : (
          <>
            <section aria-labelledby="numbers-h" className="mt-10">
              <h2 id="numbers-h" className="sr-only">
                Totals
              </h2>
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line md:grid-cols-3 lg:grid-cols-5">
                <Stat value={formatCount(totals.realPeople)} label="Real people" note="Sent at least one idea or vote." />
                <Stat value={formatCount(totals.showsCompleted)} label="Shows completed" note="Reached the finale with a round decided." />
                <Stat value={formatCount(totals.ideas)} label="Ideas written" note="By real people, after the filter." />
                <Stat value={formatCount(totals.canonMakers)} label="Canon makers" note="People whose idea won a round." />
                <Stat
                  className="col-span-2 lg:col-span-1"
                  value={totals.medianDistillMs === null ? "None yet" : formatSeconds(totals.medianDistillMs)}
                  label="Median distill time"
                  note={
                    totals.medianDistillMs === null
                      ? "No round with ideas has been timed yet."
                      : "Ideas in, three options out."
                  }
                >
                  {totals.p95DistillMs !== null ? (
                    <div className="order-4 mt-3 flex flex-wrap items-center gap-2 text-sm">
                      <span className="tabular-nums">95% finished in {formatSeconds(totals.p95DistillMs)} or less</span>
                      <Pill tone={p95Ok ? "ok" : "warn"} size="sm">
                        {p95Ok ? "Within the 8 s target" : "Over the 8 s target"}
                      </Pill>
                    </div>
                  ) : null}
                  {totals.fallbackRate !== null ? (
                    <p className="order-5 mt-2 text-sm text-muted">
                      {formatPercent(totals.fallbackRate)} of timed rounds used the simple fallback instead of the AI.
                    </p>
                  ) : null}
                </Stat>
              </dl>
              <p className="mt-3 text-sm text-muted">
                Updated {formatTimeUtc(generatedAt)}. The page reads the database at most once a minute.
              </p>
            </section>

            <section aria-labelledby="sessions-h" className="mt-14">
              <h2 id="sessions-h" className="font-display text-2xl md:text-3xl">
                Session by session
              </h2>
              <p className="mt-1 max-w-[60ch] text-muted">
                Every real show with at least one real player, newest first. A person who played twice counts once in the totals above, so the
                rows can add up to more.
              </p>
              <div className="mt-5 overflow-hidden rounded-card border border-line bg-surface">
                <table className="w-full table-fixed border-collapse text-left text-sm md:text-base">
                  <caption className="sr-only">Real shows, with date, people, ideas and rounds decided</caption>
                  <thead className="bg-surface-2 text-muted">
                    <tr>
                      <th scope="col" className="px-3 py-3 font-semibold md:px-4">
                        Show
                      </th>
                      <th scope="col" className="hidden w-32 px-4 py-3 font-semibold md:table-cell">
                        Date
                      </th>
                      <th scope="col" className="w-[19%] px-1 py-3 text-right font-semibold md:w-24 md:px-4">
                        People
                      </th>
                      <th scope="col" className="w-[17%] px-1 py-3 text-right font-semibold md:w-24 md:px-4">
                        Ideas
                      </th>
                      <th scope="col" className="w-[19%] py-3 pr-3 pl-1 text-right font-semibold md:w-24 md:px-4">
                        Rounds
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {sessions.map((s) => (
                      <tr key={s.showId}>
                        <th scope="row" className="px-3 py-3 font-semibold md:px-4">
                          <Link
                            href={`/story/${encodeURIComponent(s.showId)}`}
                            className="break-words underline decoration-line underline-offset-4 hover:decoration-accent"
                          >
                            {s.title}
                          </Link>
                          <span className="mt-0.5 block text-xs font-normal text-muted md:hidden">{formatDate(s.date)}</span>
                        </th>
                        <td className="hidden px-4 py-3 text-muted md:table-cell">{formatDate(s.date)}</td>
                        <td className="px-1 py-3 text-right tabular-nums md:px-4">{formatCount(s.people)}</td>
                        <td className="px-1 py-3 text-right tabular-nums md:px-4">{formatCount(s.ideas)}</td>
                        <td className="py-3 pr-3 pl-1 text-right tabular-nums md:px-4">{formatCount(s.rounds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        <section aria-labelledby="how-counted-h" className="mt-14">
          <details className="group rounded-card border border-line bg-surface">
            <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-card px-4 py-3 font-display text-xl font-bold marker:content-none [&::-webkit-details-marker]:hidden">
              <span id="how-counted-h">How these numbers are counted</span>
              <span aria-hidden="true" className="text-accent transition-transform group-open:rotate-45 motion-reduce:transition-none">
                +
              </span>
            </summary>
            <dl className="space-y-4 border-t border-line px-4 py-4">
              {DEFINITIONS.map((d) => (
                <div key={d.term}>
                  <dt className="font-semibold">{d.term}</dt>
                  <dd className="mt-0.5 max-w-[62ch] text-muted">{d.text}</dd>
                </div>
              ))}
            </dl>
          </details>
        </section>
      </main>
      <Footer />
    </div>
  );
}
