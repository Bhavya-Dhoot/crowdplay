// /impact: what real people have actually done on this deployment, as a page of notes. Every number is counted from the
// database on request (cached for a minute): no bots, no demo rooms, nothing estimated. With no real usage yet the page says
// so, with the real zeros and a way to add the first show, instead of showing made-up figures.
// Numbers are big Kalam numerals on paper notes. Yellow follows the thread only: the swash behind the ideas written (where
// an idea starts) and the pen loop around the canon makers (where it ends up), plus the one primary key.
import { Plus, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { formatCount, formatDate, formatPercent, formatSeconds, formatTimeUtc } from "@/components/depth/format";
import { SiteHeader } from "@/components/depth/SiteHeader";
import { ButtonLink } from "@/components/ui/Button";
import { tiltOf } from "@/components/ui/doodle";
import { Footer } from "@/components/ui/Footer";
import { InkUnderline } from "@/components/ui/InkUnderline";
import { PaperCard } from "@/components/ui/PaperCard";
import { PenCheck } from "@/components/ui/PenCheck";
import { PenLoop } from "@/components/ui/PenLoop";
import { Pill } from "@/components/ui/Pill";
import { StageBackdrop } from "@/components/ui/StageBackdrop";
import { Swash } from "@/components/ui/Swash";
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

const NUMERAL = "font-display leading-none tabular-nums [overflow-wrap:anywhere]";
const BIG = `${NUMERAL} text-[clamp(2.5rem,9vw,4rem)]`;

/** One big figure on its own paper note. `mark` decorates the numeral (the swash, the pen loop). */
function Stat({ index, value, label, note, mark }: { index: number; value: string; label: string; note: string; mark?: "swash" | "loop" }) {
  const numeral =
    mark === "swash" ? <Swash>{value}</Swash> : mark === "loop" ? <PenLoop tone="yellow" seed="impact-canon-makers" className="px-3">{value}</PenLoop> : value;
  return (
    <PaperCard alt={index % 2 === 1} tilt={tiltOf(`impact-stat-${index}`, 0.8)} className="flex flex-col px-5 pt-6 pb-5">
      <dt className="order-2 mt-4 font-display text-lead leading-tight">{label}</dt>
      <dd className={`order-1 -mx-3 px-3 ${BIG}`}>{numeral}</dd>
      <dd className="order-3 mt-1.5 text-small leading-snug text-ink-notes">{note}</dd>
    </PaperCard>
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
      <StageBackdrop />
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-20 md:px-8">
        <header className="pt-6 md:pt-12">
          <h1 className="max-w-[14ch] text-display">
            Real shows.{" "}
            <Swash play delayMs={300}>
              Real people.
            </Swash>
          </h1>
          <p className="mt-6 max-w-[46ch] text-lead leading-relaxed text-ink-notes md:text-h3">
            What people have actually done on CrowdPlay, with nothing added to make it look bigger.
          </p>
          <PaperCard tilt={-0.6} className="mt-7 flex max-w-fit items-start gap-3 rounded-element px-4 py-3 text-small shadow-slip">
            <PenCheck size={22} seed="impact-note" className="mt-0.5" />
            <span>Bots and demo rooms excluded. Numbers come straight from the database.</span>
          </PaperCard>
        </header>

        {empty ? (
          <PaperCard as="section" aria-labelledby="empty-h" edge="wild" tilt={-0.4} className="mt-12 p-6 md:p-10">
            <h2 id="empty-h" className="max-w-[20ch] text-h1 leading-tight text-balance">
              No real show has been played yet.
            </h2>
            <p className="mt-3 max-w-[56ch] text-body text-ink-notes">
              There is nothing to count, so there are no numbers here. Once real people play a show, it appears on this page within a minute. Demo
              rooms and the {DEMO_MINUTES}-minute demo use simulated players, so they never show up here.
            </p>

            {/* The real zeros: what this page will count, so the empty page reads as waiting for data, not as broken. */}
            <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6 border-t-2 border-dashed border-ink-faint pt-6 md:grid-cols-4">
              {[
                ["Real people", totals.realPeople],
                ["Shows completed", totals.showsCompleted],
                ["Ideas", totals.ideas],
                ["Canon makers", totals.canonMakers],
              ].map(([label, n]) => (
                <div key={label} className="flex flex-col">
                  <dt className="order-2 mt-2 text-small text-ink-notes">{label}</dt>
                  <dd className={`order-1 ${NUMERAL} text-[clamp(2.25rem,8vw,3.25rem)] text-ink-notes`}>{formatCount(Number(n))}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/host">Host a show, add yours</ButtonLink>
              <ButtonLink href="/try" variant="secondary">
                {COPY.landing.try.label}
              </ButtonLink>
            </div>
            <p className="mt-4 max-w-[52ch] text-small text-ink-notes">The demo is for trying the loop alone. Only a show with real people adds to these numbers.</p>
          </PaperCard>
        ) : (
          <>
            <section aria-labelledby="numbers-h" className="mt-12 md:mt-16">
              <h2 id="numbers-h" className="sr-only">
                Totals
              </h2>
              <dl className="grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-4 md:gap-x-6">
                <Stat index={0} value={formatCount(totals.realPeople)} label="Real people" note="Sent at least one idea or vote." />
                <Stat index={1} value={formatCount(totals.showsCompleted)} label="Shows completed" note="Reached the finale with a round decided." />
                <Stat index={2} value={formatCount(totals.ideas)} label="Ideas written" note="By real people, after the filter." mark={totals.ideas > 0 ? "swash" : undefined} />
                <Stat index={3} value={formatCount(totals.canonMakers)} label="Canon makers" note="People whose idea won a round." mark={totals.canonMakers > 0 ? "loop" : undefined} />
              </dl>
            </section>

            <PaperCard as="section" aria-labelledby="speed-h" tilt={0.3} className="mt-14 p-6 md:mt-16 md:p-8">
              <h2 id="speed-h" className="sr-only">
                Speed
              </h2>
              <dl className="flex flex-col gap-x-12 gap-y-5 md:flex-row md:items-end">
                <div className="flex flex-col">
                  <dt className="order-2 mt-3 font-display text-lead leading-tight">Median distill time</dt>
                  <dd className={`order-1 ${NUMERAL} ${totals.medianDistillMs === null ? "text-[clamp(1.75rem,6vw,2.5rem)] text-ink-notes" : "text-[clamp(2.5rem,9vw,4rem)]"}`}>
                    {totals.medianDistillMs === null ? "None yet" : formatSeconds(totals.medianDistillMs)}
                  </dd>
                  <dd className="order-3 mt-1.5 text-small text-ink-notes">
                    {totals.medianDistillMs === null ? "No round with ideas has been timed yet." : "Ideas in, three options out."}
                  </dd>
                </div>
                <div className="flex max-w-[44ch] flex-col gap-3 text-small">
                  {totals.p95DistillMs !== null ? (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <span className="tabular-nums">95% finished in {formatSeconds(totals.p95DistillMs)} or less</span>
                      {p95Ok ? (
                        <Pill size="sm">
                          <PenCheck size={16} seed="impact-p95" />
                          Within the 8 s target
                        </Pill>
                      ) : (
                        <Pill tone="danger" size="sm">
                          <TriangleAlert aria-hidden="true" className="size-4" />
                          Over the 8 s target
                        </Pill>
                      )}
                    </div>
                  ) : null}
                  {totals.fallbackRate !== null ? (
                    <p className="text-ink-notes">{formatPercent(totals.fallbackRate)} of timed rounds used the simple fallback instead of the AI.</p>
                  ) : null}
                </div>
              </dl>
            </PaperCard>
            <p className="mt-4 text-small text-ink-notes">Updated {formatTimeUtc(generatedAt)}. The page reads the database at most once a minute.</p>

            <section aria-labelledby="sessions-h" className="mt-16">
              <h2 id="sessions-h" className="font-display text-h2 leading-tight">
                <InkUnderline play={false} seed="impact-sessions">
                  Session by session
                </InkUnderline>
              </h2>
              <p className="mt-3 max-w-[60ch] text-ink-notes">
                Every real show with at least one real player, newest first. A person who played twice counts once in the totals above, so the
                rows can add up to more.
              </p>
              <PaperCard className="mt-6 overflow-hidden">
                <table className="dp-table dp-table-links table-fixed text-small md:text-body">
                  <caption className="sr-only">Real shows, with date, people, ideas and rounds decided</caption>
                  <thead>
                    <tr>
                      <th scope="col" className="px-3 py-3 text-left md:px-5">
                        Show
                      </th>
                      <th scope="col" className="hidden w-32 px-4 py-3 text-left md:table-cell">
                        Date
                      </th>
                      <th scope="col" className="w-[19%] px-1 py-3 text-right md:w-24 md:px-4">
                        People
                      </th>
                      <th scope="col" className="w-[17%] px-1 py-3 text-right md:w-24 md:px-4">
                        Ideas
                      </th>
                      <th scope="col" className="w-[19%] py-3 pr-3 pl-1 text-right md:w-24 md:px-5">
                        Rounds
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s) => (
                      <tr key={s.showId}>
                        <th scope="row" className="relative px-3 py-3.5 text-left font-display font-normal md:px-5">
                          {/* The link covers the whole cell, so the tap target is at least 44 px tall whatever the title length. */}
                          <Link
                            href={`/story/${encodeURIComponent(s.showId)}`}
                            className="break-words underline decoration-ink-faint decoration-2 underline-offset-4 after:absolute after:inset-0 hover:decoration-ink"
                          >
                            {s.title}
                          </Link>
                          <span className="mt-0.5 block font-sans text-fine text-ink-notes md:hidden">{formatDate(s.date)}</span>
                        </th>
                        <td className="hidden px-4 py-3.5 text-ink-notes md:table-cell">{formatDate(s.date)}</td>
                        <td className="px-1 py-3.5 text-right tabular-nums md:px-4">{formatCount(s.people)}</td>
                        <td className="px-1 py-3.5 text-right tabular-nums md:px-4">{formatCount(s.ideas)}</td>
                        <td className="py-3.5 pr-3 pl-1 text-right tabular-nums md:px-5">{formatCount(s.rounds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </PaperCard>
            </section>

            <section aria-labelledby="more-h" className="mt-14 flex flex-wrap items-center gap-4">
              <h2 id="more-h" className="font-display text-lead">
                Want your show in this list?
              </h2>
              <ButtonLink href="/host">Host a show, add yours</ButtonLink>
            </section>
          </>
        )}

        <section aria-labelledby="how-counted-h" className="mt-14">
          <details className="group paper">
            <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-3 px-4 py-3 font-display text-lead marker:content-none [&::-webkit-details-marker]:hidden">
              <span id="how-counted-h">How these numbers are counted</span>
              <Plus aria-hidden="true" className="size-6 shrink-0 transition-transform duration-175 group-open:rotate-45 motion-reduce:transition-none" strokeWidth={2.5} />
            </summary>
            <dl className="space-y-4 border-t-2 border-dashed border-ink-faint px-4 py-4">
              {DEFINITIONS.map((d) => (
                <div key={d.term}>
                  <dt className="font-display">{d.term}</dt>
                  <dd className="mt-0.5 max-w-[62ch] text-ink-notes">{d.text}</dd>
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
