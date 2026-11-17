// /story/[showId]: the recap people share (UX_SPEC §3.7), laid out as a printed playbill: a paper page on the stage
// with a title page, one scene per round (the winning line with its letter, the narrator's text, who wrote it), and
// a cast list of the canon makers. Server component: the only client code is the share button and a small
// refresher that waits for the narrator's recap.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { StoryRes, StoryRound } from "@/lib/api/contracts";
import { Credits } from "@/components/depth/Credits";
import { formatDate } from "@/components/depth/format";
import { ShareButton } from "@/components/depth/ShareButton";
import { SiteHeader } from "@/components/depth/SiteHeader";
import { StoryRefresh } from "@/components/depth/StoryRefresh";
import { isFinished, presetLabel, recapPending, storyBlurb, storyHeading } from "@/components/depth/storyState";
import { loadWinnerSlots, type Slot } from "@/components/depth/winnerSlots";
import { BotBadge } from "@/components/ui/BotBadge";
import { ButtonLink } from "@/components/ui/Button";
import { Footer } from "@/components/ui/Footer";
import { GelDisc, gelOf } from "@/components/ui/GelDisc";
import { Pill } from "@/components/ui/Pill";
import { SkeletonText } from "@/components/ui/Skeleton";
import { StageBackdrop } from "@/components/ui/StageBackdrop";
import { Stamp, type StampKind } from "@/components/ui/Stamp";
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

const STAMP: Record<string, StampKind> = { crowd: "canon", wildcard: "wildcard", narrator: "narrator" };
const LINE_LABEL: Record<string, string> = { crowd: "Winning line", wildcard: "Winning wildcard", narrator: "The narrator's line" };

const SECTION_H = "font-display text-h3 leading-tight font-extrabold text-ink md:text-h2";

function Scene({ round, slot }: { round: StoryRound; slot: Slot | undefined }) {
  const kind = round.winner?.kind ?? "narrator";
  const credited = round.credit.length > 0 || round.more > 0;
  return (
    <li className="mt-8 border-t border-paper-edge pt-8 first:mt-0 first:border-t-0 first:pt-0">
      <h3 className="font-display leading-tight font-extrabold text-ink">
        <span className="block text-small font-semibold text-ink-muted">
          Scene {round.roundNo}
          <span className="sr-only">: </span>
        </span>
        <span className="mt-0.5 block text-h3 break-words md:text-[1.75rem]">{round.prompt.title}</span>
      </h3>
      <p className="script mt-2 max-w-[60ch] text-body text-ink-muted italic break-words">{round.prompt.text}</p>

      {round.winner ? (
        <div className="dp-line mt-5" data-gel={slot ? gelOf(slot) : undefined}>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <p className="flex items-center gap-2.5 text-small font-semibold text-ink-muted">
              {slot ? <GelDisc letter={slot} size={36} /> : null}
              <span>{LINE_LABEL[kind] ?? LINE_LABEL.crowd}</span>
            </p>
            <Stamp kind={STAMP[kind] ?? "canon"} size="sm" animate={false} />
          </div>
          <p className="mt-2 font-display text-lead leading-snug font-bold text-ink break-words md:text-h3">{round.winner.label}</p>
        </div>
      ) : null}

      <p className="mt-6 font-display text-small font-bold text-ink">Narrator</p>
      {round.narration ? (
        <p className="script mt-1 max-w-[62ch] text-[1.125rem] leading-[1.7] text-ink break-words md:text-lead">{round.narration}</p>
      ) : (
        <p className="script mt-1 text-body text-ink-muted italic">The narrator is still writing this part.</p>
      )}

      {credited ? (
        <p className="dp-credit mt-4 text-small leading-7 text-ink-muted">
          Written by{" "}
          <span className="text-ink">
            <Credits credit={round.credit} more={round.more} />
          </span>
        </p>
      ) : null}
    </li>
  );
}

function Cast({ makers }: { makers: StoryRes["canonMakers"] }) {
  if (makers.length === 0) return null;
  return (
    <section aria-labelledby="canon-h" className="mt-12 border-t border-paper-edge pt-8">
      <h2 id="canon-h" className={SECTION_H}>
        Cast
      </h2>
      <p className="mt-1 text-small text-ink-muted">The canon makers: people whose ideas won a round.</p>
      <ol className="mt-5 space-y-2.5">
        {makers.slice(0, 10).map((m, i) => (
          <li key={`${m.name}-${i}`} className="dp-cast-row">
            <span className="min-w-0 font-display text-lead leading-snug font-bold break-words text-ink">
              {m.name}
              {m.bot ? (
                <>
                  {" "}
                  <span className="dp-credit">
                    <BotBadge />
                  </span>
                </>
              ) : null}
            </span>
            <span className="dp-leader" aria-hidden="true" />
            <span className="shrink-0 text-small text-ink-muted tabular-nums">
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
  const slots = await loadWinnerSlots(showId);
  const heading = storyHeading(show);
  const pending = recapPending(show);
  const finished = isFinished(show);
  const hasRecap = Boolean(show.recap && show.recap.trim());
  const tagline = show.tagline?.trim() ?? "";
  const when = show.startedAt ?? show.endedAt;

  return (
    <div className="flex min-h-dvh flex-col">
      <StageBackdrop roundNo={1} />
      <SiteHeader />
      <StoryRefresh active={pending} />

      <main id="main" className="mx-auto w-full max-w-[50rem] flex-1 px-4 pb-16 md:pb-24">
        <div className="flex flex-wrap items-center gap-3 pt-2 pb-5 md:pt-4">
          <ShareButton title={heading} text={storyBlurb(show)} />
          <ButtonLink href="/host" variant="secondary">
            Host your own
          </ButtonLink>
        </div>

        <article className="paper dp-sheet px-6 pt-10 pb-10 md:px-14 md:pt-16 md:pb-16">
          {show.isDemo ? (
            <span aria-hidden="true" className="stamp stamp-wildcard stamp-md absolute -top-3 right-5 z-10">
              Demo
            </span>
          ) : null}

          <header className="relative text-center">
            <p className="text-small text-ink-muted">{COPY.brand} presents</p>

            <h1 className="mt-4 font-display text-[clamp(2.25rem,9.5vw,4.5rem)] leading-[0.98] font-extrabold tracking-[-0.035em] break-words text-balance text-ink">
              {heading}
            </h1>

            {tagline ? (
              <p className="script mx-auto mt-5 max-w-[30ch] text-[clamp(1.25rem,3.6vw,1.75rem)] leading-snug text-ink-muted italic break-words">
                {tagline}
              </p>
            ) : pending ? (
              <p className="script mt-5 text-lead text-ink-muted italic">The narrator is writing the tagline…</p>
            ) : null}

            <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-small text-ink-muted">
              <li>{presetLabel(show)}</li>
              <li>{rounds.length === 0 ? "No scenes yet" : `${rounds.length} ${rounds.length === 1 ? "scene" : "scenes"}`}</li>
              {when ? (
                <li>
                  <time dateTime={new Date(when).toISOString()}>{formatDate(when)}</time>
                </li>
              ) : null}
              {!finished ? (
                <li>
                  <Pill tone="ok" size="sm">
                    Still playing
                  </Pill>
                </li>
              ) : null}
            </ul>

            {show.isDemo ? (
              <p className="mx-auto mt-6 flex max-w-[44ch] items-start gap-2 rounded-element bg-paper-2 px-4 py-3 text-left text-small text-ink">
                <span aria-hidden="true">🤖</span>
                <span>
                  <strong className="font-semibold">Demo show.</strong> The players in this story are simulated. Live shows use real people.
                </span>
              </p>
            ) : null}
          </header>

          <div className="dp-orn my-9 md:my-12" aria-hidden="true">
            <span />
          </div>

          <section aria-labelledby="setup-h">
            <h2 id="setup-h" className={SECTION_H}>
              The setup
            </h2>
            <p className="script mt-3 max-w-[62ch] text-[1.125rem] leading-[1.7] text-ink break-words md:text-lead">{show.premise}</p>
          </section>

          {hasRecap ? (
            <section aria-labelledby="recap-h" className="mt-10">
              <h2 id="recap-h" className={SECTION_H}>
                The story, start to finish
              </h2>
              <p className="script dp-dropcap mt-3 max-w-[62ch] text-[1.125rem] leading-[1.7] text-ink break-words md:text-lead">{show.recap}</p>
            </section>
          ) : pending ? (
            <section aria-labelledby="recap-h" className="mt-10" aria-busy="true">
              <h2 id="recap-h" className={SECTION_H}>
                The story, start to finish
              </h2>
              <p role="status" className="mt-2 text-small text-ink-muted">
                The narrator is writing the recap. This page updates by itself.
              </p>
              <SkeletonText lines={4} tone="paper" className="mt-4" />
            </section>
          ) : null}

          <section aria-labelledby="rounds-h" className="mt-12 border-t border-paper-edge pt-8">
            <h2 id="rounds-h" className={SECTION_H}>
              Scene by scene
            </h2>
            {rounds.length === 0 ? (
              <p className="mt-3 text-ink-muted">Nothing has been revealed yet. Check back once the first scene is decided.</p>
            ) : (
              <ol className="mt-6">
                {rounds.map((r) => (
                  <Scene key={r.roundNo} round={r} slot={slots.get(r.roundNo)} />
                ))}
              </ol>
            )}
          </section>

          <Cast makers={canonMakers} />

          <div className="dp-orn mt-12 md:mt-16" aria-hidden="true">
            <span />
          </div>
          <p className="script mt-5 text-center text-body text-ink-muted italic">Curtain.</p>
        </article>

        <section aria-labelledby="cta-h" className="mt-14 text-center md:mt-20">
          <h2 id="cta-h" className="font-display text-h2 leading-tight font-extrabold text-balance text-on-stage md:text-[2.5rem]">
            Your crowd could write the next one.
          </h2>
          <p className="mx-auto mt-3 max-w-[44ch] text-muted-on-stage">
            Pick a premise, share a code and let everyone type. You get a story like this one when the show ends.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/host">Host your own</ButtonLink>
            <ButtonLink href="/try" variant="secondary">
              {COPY.landing.try.label}
            </ButtonLink>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
