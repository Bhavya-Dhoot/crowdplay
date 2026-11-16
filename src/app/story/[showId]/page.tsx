// /story/[showId]: the recap people share (UX_SPEC §3.7). Title, premise, every round with its winner,
// narration and credits, the canon makers, and a way to host your own. Server component: the only client
// code is the share button and a small refresher that waits for the narrator's recap.
import { Sparkles, Trophy, Zap } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { StoryRes, StoryRound } from "@/lib/api/contracts";
import { Credits } from "@/components/depth/Credits";
import { formatDate } from "@/components/depth/format";
import { ShareButton } from "@/components/depth/ShareButton";
import { SiteHeader } from "@/components/depth/SiteHeader";
import { StoryRefresh } from "@/components/depth/StoryRefresh";
import { isFinished, presetLabel, recapPending, storyBlurb, storyHeading } from "@/components/depth/storyState";
import { Avatar } from "@/components/ui/Avatar";
import { BotBadge } from "@/components/ui/BotBadge";
import { ButtonLink } from "@/components/ui/Button";
import { Card, type CardTone } from "@/components/ui/Card";
import { Footer } from "@/components/ui/Footer";
import { Pill } from "@/components/ui/Pill";
import { SkeletonText } from "@/components/ui/Skeleton";
import { COPY } from "@/lib/copy";
import { loadStory } from "@/lib/metrics";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ showId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { showId } = await params;
  const story = await loadStory(showId).catch(() => null);
  if (!story) return { title: "Story not found", robots: { index: false } };
  const title = storyHeading(story.show);
  const description = storyBlurb(story.show);
  const url = `/story/${encodeURIComponent(showId)}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "article", url, siteName: COPY.brand, title, description },
    twitter: { card: "summary_large_image", title, description },
    // A demo show is real engine output but not real usage: keep it out of search results.
    robots: story.show.isDemo ? { index: false } : undefined,
  };
}

function KindPill({ kind }: { kind: string }) {
  if (kind === "wildcard") {
    return (
      <Pill tone="wild" size="sm">
        <Zap aria-hidden="true" className="size-3.5" />
        Wildcard
      </Pill>
    );
  }
  if (kind === "narrator") {
    return (
      <Pill tone="neutral" size="sm">
        {COPY.reveal.narratorPick}
      </Pill>
    );
  }
  return (
    <Pill tone="outline" size="sm">
      <Trophy aria-hidden="true" className="size-3.5" />
      Crowd pick
    </Pill>
  );
}

const WINNER_TONE: Record<string, CardTone> = { crowd: "accent", wildcard: "wild", narrator: "raised" };

function RoundEntry({ round, last }: { round: StoryRound; last: boolean }) {
  const kind = round.winner?.kind ?? "narrator";
  const credited = round.credit.length > 0 || round.more > 0;
  return (
    <li className="relative grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 md:gap-x-6">
      <div className="relative flex flex-col items-center" aria-hidden="true">
        <span className="grid size-10 shrink-0 place-items-center rounded-full border border-accent bg-bg font-display text-lg font-extrabold text-accent">
          {round.roundNo}
        </span>
        {last ? null : <span className="mt-2 w-px flex-1 bg-line" />}
      </div>
      <div className={last ? "pb-0" : "pb-10"}>
        <h3 className="font-display text-2xl leading-tight break-words md:text-3xl">
          <span className="sr-only">Round {round.roundNo}: </span>
          {round.prompt.title}
        </h3>
        <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed break-words text-muted">{round.prompt.text}</p>

        <Card tone={WINNER_TONE[kind] ?? "default"} className="mt-4 space-y-3 p-4 md:p-5">
          <div className="flex items-center gap-2">
            <KindPill kind={kind} />
            <span className="text-sm text-muted">won this round</span>
          </div>
          {round.winner ? <p className="font-display text-xl leading-snug font-bold break-words md:text-2xl">{round.winner.label}</p> : null}
          {round.narration ? (
            <p className="max-w-[62ch] text-base leading-relaxed break-words md:text-lg">{round.narration}</p>
          ) : (
            <p className="text-muted italic">The narrator is still writing this part.</p>
          )}
          {credited ? (
            <p className="flex items-start gap-2 text-[15px] leading-7 text-accent">
              <Sparkles aria-hidden="true" className="mt-1.5 size-4 shrink-0" />
              <span className="sr-only">Credited: </span>
              <span>
                <Credits credit={round.credit} more={round.more} />
              </span>
            </p>
          ) : null}
        </Card>
      </div>
    </li>
  );
}

function CanonMakers({ makers }: { makers: StoryRes["canonMakers"] }) {
  if (makers.length === 0) return null;
  const top = makers.slice(0, 10);
  return (
    <section aria-labelledby="canon-h" className="mt-16">
      <h2 id="canon-h" className="font-display text-2xl md:text-3xl">
        Canon makers
      </h2>
      <p className="mt-1 text-muted">People whose ideas won a round.</p>
      <ol className="mt-5 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
        {top.map((m, i) => (
          <li key={`${m.name}-${i}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
            <span className="w-6 text-center font-display text-lg font-extrabold text-muted tabular-nums">{i + 1}</span>
            <Avatar name={m.name} size={36} />
            <span className="min-w-0 flex-1 truncate font-semibold">
              {m.name} {m.bot ? <BotBadge /> : null}
            </span>
            <span className={`shrink-0 text-sm tabular-nums ${i === 0 ? "font-semibold text-accent" : "text-muted"}`}>
              {m.count} {m.count === 1 ? "win" : "wins"}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default async function StoryPage({ params }: Params) {
  const { showId } = await params;
  const story = await loadStory(showId);
  if (!story) notFound();

  const { show, rounds, canonMakers } = story;
  const heading = storyHeading(show);
  const pending = recapPending(show);
  const finished = isFinished(show);
  const hasRecap = Boolean(show.recap && show.recap.trim());
  const tagline = show.tagline?.trim() ?? "";
  const when = show.startedAt ?? show.endedAt;

  return (
    <div className="stage-light flex min-h-dvh flex-col">
      <SiteHeader />
      <StoryRefresh active={pending} />

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 md:px-8">
        <header className="pt-6 md:pt-12">
          {show.isDemo ? (
            <p className="mb-5 flex items-start gap-2 rounded-card border border-wild/50 bg-surface px-4 py-3 text-sm">
              <span aria-hidden="true">🤖</span>
              <span>
                <strong className="font-semibold">Demo show.</strong> The players in this story are simulated. Live shows use real people.
              </span>
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
            <Pill tone="neutral" size="sm">
              {presetLabel(show)}
            </Pill>
            <span>{rounds.length === 0 ? "No rounds told yet" : `${rounds.length} ${rounds.length === 1 ? "round" : "rounds"} told`}</span>
            {when ? <time dateTime={new Date(when).toISOString()}>{formatDate(when)}</time> : null}
            {!finished ? (
              <Pill tone="ok" size="sm">
                Still playing
              </Pill>
            ) : null}
          </div>

          <h1 className="mt-4 font-display text-[clamp(2.5rem,9.5vw,5.5rem)] leading-[0.95] font-extrabold tracking-[-0.04em] break-words text-balance">
            {heading}
          </h1>

          {tagline ? (
            <p className="mt-4 max-w-[36ch] text-xl break-words text-muted md:text-2xl">{tagline}</p>
          ) : pending ? (
            <p className="mt-4 text-lg text-muted">The narrator is writing the tagline…</p>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <ShareButton title={heading} text={storyBlurb(show)} />
            <ButtonLink href="/host" variant="secondary">
              Host your own
            </ButtonLink>
          </div>
        </header>

        <section aria-labelledby="setup-h" className="mt-12">
          <h2 id="setup-h" className="font-display text-2xl md:text-3xl">
            The setup
          </h2>
          <p className="mt-3 max-w-[62ch] text-lg leading-relaxed break-words text-muted">{show.premise}</p>
        </section>

        {hasRecap ? (
          <section aria-labelledby="recap-h" className="mt-10">
            <Card tone="accent" className="p-5 md:p-8">
              <h2 id="recap-h" className="font-display text-2xl md:text-3xl">
                The story, start to finish
              </h2>
              <p className="mt-3 max-w-[62ch] text-lg leading-relaxed break-words">{show.recap}</p>
            </Card>
          </section>
        ) : pending ? (
          <section aria-labelledby="recap-h" className="mt-10" aria-busy="true">
            <Card className="p-5 md:p-8">
              <h2 id="recap-h" className="font-display text-2xl md:text-3xl">
                The story, start to finish
              </h2>
              <p role="status" className="mt-2 text-muted">
                The narrator is writing the recap. This page updates by itself.
              </p>
              <SkeletonText lines={4} className="mt-4" />
            </Card>
          </section>
        ) : null}

        <section aria-labelledby="rounds-h" className="mt-16">
          <h2 id="rounds-h" className="font-display text-2xl md:text-3xl">
            Round by round
          </h2>
          {rounds.length === 0 ? (
            <p className="mt-3 text-muted">Nothing has been revealed yet. Check back once the first round is decided.</p>
          ) : (
            <ol className="mt-6">
              {rounds.map((r, i) => (
                <RoundEntry key={r.roundNo} round={r} last={i === rounds.length - 1} />
              ))}
            </ol>
          )}
        </section>

        <CanonMakers makers={canonMakers} />

        <section aria-labelledby="cta-h" className="mt-20">
          <Card tone="raised" className="p-6 md:p-8">
            <h2 id="cta-h" className="font-display text-3xl leading-tight md:text-4xl">
              Your crowd could write the next one.
            </h2>
            <p className="mt-2 max-w-[48ch] text-muted">
              Pick a premise, share a code and let everyone type. You get a story like this one when the show ends.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <ButtonLink href="/host">Host your own</ButtonLink>
              <ButtonLink href="/try" variant="secondary">
                Try it alone (60 s)
              </ButtonLink>
            </div>
          </Card>
        </section>
      </main>

      <Footer />
    </div>
  );
}
