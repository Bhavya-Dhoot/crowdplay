// /impact: what real people have actually done on this deployment. Every number is counted from the
// database on request (cached for a minute): no bots, no demo rooms, nothing estimated. With no real usage
// yet the page says so, with the real zeros and a way to add the first show, instead of showing made-up figures.
import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { formatCount, formatDate, formatPercent, formatSeconds, formatTimeUtc } from "@/components/depth/format";
import { SiteHeader } from "@/components/depth/SiteHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Footer } from "@/components/ui/Footer";
import { Pill } from "@/components/ui/Pill";
import { StageBackdrop } from "@/components/ui/StageBackdrop";
import { COPY, DEMO_MINUTES } from "@/lib/copy";
import { getImpact } from "@/lib/metrics";

export const dynamic = "force-dynamic";

const DESCRIPTION = "Real people, real shows, counted straight from the database. Bots and demo rooms are never included.";

export const metadata: Metadata = {
  title: "Impact",
  description: DESCRIPTION,
  openGraph: { title: "CrowdPlay impact", description: DESCRIPTION },
};

const P95_TARGET_MS = 8000;

const NUMERAL = "font-display text-[clamp(3.25rem,12vw,6rem)] leading-[0.9] font-extrabold tracking-[-0.04em] tabular-nums";

/** One big figure. dd comes first visually (order-1) but the label stays first in the markup for screen readers. */
function Stat({ value, label, note, canon, muted }: { value: string; label: string; note: string; canon?: boolean; muted?: boolean }) {
  return (
    <div className="flex flex-col py-1 md:border-l md:border-stage-line md:pl-6 md:first:border-l-0 md:first:pl-0">
      <dt className="order-2 mt-3 font-display text-lead leading-tight font-bold text-on-stage">{label}</dt>
      <dd className={`order-1 ${NUMERAL} ${canon ? "text-gold" : muted ? "text-muted-on-stage" : "text-on-stage"}`}>{value}</dd>
      <dd className="order-3 mt-1.5 max-w-[24ch] text-small leading-snug text-muted-on-stage">{note}</dd>
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
  { term: "Excluded everywhere", text: "Bots, demo rooms (including the demo you play alone), and anyone who deleted their data." },
];

export default async function ImpactPage() {
  const { totals, sessions, generatedAt } = await getImpact();
  const empty = totals.realPeople === 0 && sessions.length === 0;
  const p95Ok = totals.p95DistillMs !== null && totals.p95DistillMs <= P95_TARGET_MS;

  return (
    <div className="flex min-h-dvh flex-col">
      <StageBackdrop roundNo={2} />
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-20 md:px-8">
        <header className="pt-6 md:pt-12">
          <h1 className="max-w-[14ch] font-display text-[clamp(2.75rem,10vw,5rem)] leading-[0.94] font-extrabold tracking-[-0.04em] text-balance">
            Real shows. Real people.
          </h1>
          <p className="script mt-5 max-w-[46ch] text-lead leading-relaxed text-muted-on-stage md:text-[1.375rem]">
            What people have actually done on CrowdPlay, with nothing added to make it look bigger.
          </p>
          <p className="mt-6 flex items-start gap-3 rounded-element border border-stage-line bg-stage-1 px-4 py-3 text-small md:max-w-fit">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-ok" />
            <span>Bots and demo rooms excluded. Numbers come straight from the database.</span>
          </p>
        </header>

        {empty ? (
          <section aria-labelledby="empty-h" className="mt-10 rounded-card border border-stage-line bg-stage-1 p-6 md:p-10">
            <h2 id="empty-h" className="max-w-[20ch] font-display text-h1 leading-tight font-extrabold text-balance md:text-[2.75rem]">
              No real show has been played yet.
            </h2>
            <p className="mt-3 max-w-[56ch] text-body text-muted-on-stage">
              There is nothing to count, so there are no numbers here. Once real people play a show, it appears on this page within a minute. Demo
              rooms and the {DEMO_MINUTES}-minute demo use simulated players, so they never show up here.
            </p>

            {/* The real zeros: what this page will count, so the empty page reads as waiting for data, not as broken. */}
            <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6 border-t border-stage-line pt-6 md:grid-cols-4">
              {[
                ["Real people", totals.realPeople],
                ["Shows completed", totals.showsCompleted],
                ["Ideas", totals.ideas],
                ["Canon makers", totals.canonMakers],
              ].map(([label, n]) => (
                <div key={label} className="flex flex-col">
                  <dt className="order-2 mt-2 text-small text-muted-on-stage">{label}</dt>
                  <dd className={`order-1 ${NUMERAL} text-[clamp(2.5rem,9vw,3.5rem)] text-muted-on-stage`}>{formatCount(Number(n))}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/host">Host a show, add yours</ButtonLink>
              <ButtonLink href="/try" variant="secondary">
                {COPY.landing.try.label}
              </ButtonLink>
            </div>
            <p className="mt-3 max-w-[52ch] text-small text-muted-on-stage">The demo is for trying the loop alone. Only a show with real people adds to these numbers.</p>
          </section>
        ) : (
          <>
            <section aria-labelledby="numbers-h" className="mt-12 md:mt-16">
              <h2 id="numbers-h" className="sr-only">
                Totals
              </h2>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4">
                <Stat value={formatCount(totals.realPeople)} label="Real people" note="Sent at least one idea or vote." />
                <Stat value={formatCount(totals.showsCompleted)} label="Shows completed" note="Reached the finale with a round decided." />
                <Stat value={formatCount(totals.ideas)} label="Ideas written" note="By real people, after the filter." />
                <Stat value={formatCount(totals.canonMakers)} label="Canon makers" note="People whose idea won a round." canon />
              </dl>
            </section>

            <section aria-labelledby="speed-h" className="mt-12 rounded-card border border-stage-line bg-stage-1 p-6 md:mt-16 md:p-8">
              <h2 id="speed-h" className="sr-only">
                Speed
              </h2>
              <dl className="flex flex-col gap-x-12 gap-y-5 md:flex-row md:items-end">
                <div className="flex flex-col">
                  <dt className="order-2 mt-3 font-display text-lead leading-tight font-bold">Median distill time</dt>
                  <dd className={`order-1 ${NUMERAL} ${totals.medianDistillMs === null ? "text-[clamp(2rem,7vw,3rem)] text-muted-on-stage" : "text-on-stage"}`}>
                    {totals.medianDistillMs === null ? "None yet" : formatSeconds(totals.medianDistillMs)}
                  </dd>
                  <dd className="order-3 mt-1.5 text-small text-muted-on-stage">
                    {totals.medianDistillMs === null ? "No round with ideas has been timed yet." : "Ideas in, three options out."}
                  </dd>
                </div>
                <div className="flex max-w-[44ch] flex-col gap-2 text-small">
                  {totals.p95DistillMs !== null ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tabular-nums">95% finished in {formatSeconds(totals.p95DistillMs)} or less</span>
                      <Pill tone={p95Ok ? "ok" : "warn"} size="sm">
                        {p95Ok ? "Within the 8 s target" : "Over the 8 s target"}
                      </Pill>
                    </div>
                  ) : null}
                  {totals.fallbackRate !== null ? (
                    <p className="text-muted-on-stage">{formatPercent(totals.fallbackRate)} of timed rounds used the simple fallback instead of the AI.</p>
                  ) : null}
                </div>
              </dl>
            </section>
            <p className="mt-3 text-small text-muted-on-stage">
              Updated {formatTimeUtc(generatedAt)}. The page reads the database at most once a minute.
            </p>

            <section aria-labelledby="sessions-h" className="mt-14">
              <h2 id="sessions-h" className="font-display text-h2 leading-tight font-extrabold md:text-[2.25rem]">
                Session by session
              </h2>
              <p className="mt-1 max-w-[60ch] text-muted-on-stage">
                Every real show with at least one real player, newest first. A person who played twice counts once in the totals above, so the
                rows can add up to more.
              </p>
              <div className="paper mt-5 overflow-hidden">
                <table className="w-full table-fixed border-collapse text-left text-small md:text-body">
                  <caption className="sr-only">Real shows, with date, people, ideas and rounds decided</caption>
                  <thead className="bg-paper-2 text-ink-muted">
                    <tr>
                      <th scope="col" className="px-3 py-3 font-semibold md:px-5">
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
                      <th scope="col" className="w-[19%] py-3 pr-3 pl-1 text-right font-semibold md:w-24 md:px-5">
                        Rounds
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-paper-edge text-ink">
                    {sessions.map((s) => (
                      <tr key={s.showId}>
                        <th scope="row" className="relative px-3 py-3.5 font-semibold md:px-5">
                          {/* The link covers the whole cell, so the tap target is at least 44 px tall whatever the title length. */}
                          <Link
                            href={`/story/${encodeURIComponent(s.showId)}`}
                            className="break-words underline decoration-paper-edge decoration-2 underline-offset-4 after:absolute after:inset-0 hover:decoration-ink"
                          >
                            {s.title}
                          </Link>
                          <span className="mt-0.5 block text-fine font-normal text-ink-muted md:hidden">{formatDate(s.date)}</span>
                        </th>
                        <td className="hidden px-4 py-3.5 text-ink-muted md:table-cell">{formatDate(s.date)}</td>
                        <td className="px-1 py-3.5 text-right tabular-nums md:px-4">{formatCount(s.people)}</td>
                        <td className="px-1 py-3.5 text-right tabular-nums md:px-4">{formatCount(s.ideas)}</td>
                        <td className="py-3.5 pr-3 pl-1 text-right tabular-nums md:px-5">{formatCount(s.rounds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section aria-labelledby="more-h" className="mt-14 flex flex-wrap items-center gap-4">
              <h2 id="more-h" className="font-display text-lead font-bold">
                Want your show in this list?
              </h2>
              <ButtonLink href="/host">Host a show, add yours</ButtonLink>
            </section>
          </>
        )}

        <section aria-labelledby="how-counted-h" className="mt-14">
          <details className="group rounded-card border border-stage-line bg-stage-1">
            <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-card px-4 py-3 font-display text-lead font-bold marker:content-none [&::-webkit-details-marker]:hidden">
              <span id="how-counted-h">How these numbers are counted</span>
              <span aria-hidden="true" className="text-gold transition-transform duration-175 group-open:rotate-45 motion-reduce:transition-none">
                +
              </span>
            </summary>
            <dl className="space-y-4 border-t border-stage-line px-4 py-4">
              {DEFINITIONS.map((d) => (
                <div key={d.term}>
                  <dt className="font-semibold">{d.term}</dt>
                  <dd className="mt-0.5 max-w-[62ch] text-muted-on-stage">{d.text}</dd>
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
