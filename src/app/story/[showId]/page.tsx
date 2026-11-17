// /story/[showId]: the show's sketchnote poster (design-v3 §4), printable. A title banner with a yellow swash on one word,
// the tagline and the recap as notes, then one numbered box per scene (the prompt, the winning line with its letter, the
// narrator's text as a note, who wrote it) joined by yellow fat arrows, and a cast list of the canon makers. The yellow
// stays on the thread: the swash, the numbered banners, the arrows, the canon ribbon and edge, and the one primary key
// (Share story). Server component: the only client code is the share button and a small refresher that waits for the
// narrator's recap.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { StoryRes, StoryRound } from "@/lib/api/contracts";
import { Credits } from "@/components/depth/Credits";
import { formatDate } from "@/components/depth/format";
import { ShareButton } from "@/components/depth/ShareButton";
import { SiteHeader } from "@/components/depth/SiteHeader";
import { StoryRefresh } from "@/components/depth/StoryRefresh";
import { isFinished, presetLabel, recapPending, storyBlurb, storyHeading } from "@/components/depth/storyState";
import { TitleBanner } from "@/components/depth/TitleBanner";
import { loadWinnerSlots, type Slot } from "@/components/depth/winnerSlots";
import { NumberBanner } from "@/components/ui/Banner";
import { BotBadge } from "@/components/ui/BotBadge";
import { ButtonLink } from "@/components/ui/Button";
import { tiltOf } from "@/components/ui/doodle";
import { FatArrow } from "@/components/ui/FatArrow";
import { Footer } from "@/components/ui/Footer";
import { InkUnderline } from "@/components/ui/InkUnderline";
import { LetterBadge } from "@/components/ui/LetterBadge";
import { PaperCard } from "@/components/ui/PaperCard";
import { Pill } from "@/components/ui/Pill";
import { Ribbon, type RibbonKind } from "@/components/ui/Ribbon";
import { SkeletonText } from "@/components/ui/Skeleton";
import { StageBackdrop } from "@/components/ui/StageBackdrop";
import { Swash } from "@/components/ui/Swash";
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

const RIBBON: Record<string, RibbonKind> = { crowd: "canon", wildcard: "wildcard", narrator: "narrator" };
const LINE_LABEL: Record<string, string> = { crowd: "Winning line", wildcard: "Winning wildcard", narrator: "The narrator's line" };
// The winner's box carries the kind: canon = the yellow edge, wildcard = dashed, the narrator's pick = plain.
const LINE_EDGE: Record<string, "gold" | "wild" | undefined> = { crowd: "gold", wildcard: "wild", narrator: undefined };

const H2 = "font-display text-h3 leading-tight md:text-h2";

// The first scenes are drawn as the page loads; further down the poster they are simply there (nobody sees them draw).
const DRAWN_SCENES = 3;
const sceneDelay = (i: number): number => 500 + i * 450;

function Scene({ round, slot, index, last }: { round: StoryRound; slot: Slot | undefined; index: number; last: boolean }) {
  const kind = round.winner?.kind ?? "narrator";
  const credited = round.credit.length > 0 || round.more > 0;
  const drawn = index < DRAWN_SCENES;
  return (
    <li className="break-inside-avoid">
      <PaperCard
        alt={index % 2 === 1}
        tilt={tiltOf(`scene-${round.roundNo}`, 0.5)}
        data-slot={slot}
        className="shadow-poster grid gap-x-8 gap-y-6 p-5 pt-9 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] md:p-8 md:pt-10"
      >
        <NumberBanner n="Scene" label={String(round.roundNo)} play={drawn} delayMs={sceneDelay(index)} className="absolute -top-[19px] left-5 md:left-8" />

        <div className="min-w-0">
          <h3 className="font-display text-h3 leading-tight break-words">
            <span className="sr-only">Scene {round.roundNo}: </span>
            {round.prompt.title}
          </h3>
          <p className="mt-2 max-w-[60ch] text-body text-ink-notes break-words">{round.prompt.text}</p>

          {round.winner ? (
            <PaperCard edge={LINE_EDGE[kind]} className="mt-7 flex items-start gap-3 rounded-element px-4 pt-6 pb-4">
              <Ribbon kind={RIBBON[kind] ?? "canon"} size="sm" animate={false} className="absolute -top-4 right-2" />
              {slot ? <LetterBadge letter={slot} size={44} animate={false} className="mt-0.5" /> : null}
              <div className="min-w-0">
                <p className="text-small text-ink-notes">{LINE_LABEL[kind] ?? LINE_LABEL.crowd}</p>
                <p className="mt-0.5 font-display text-lead leading-snug break-words">{round.winner.label}</p>
              </div>
            </PaperCard>
          ) : null}
        </div>

        <div className="min-w-0">
          <PaperCard tone="paper-2" tilt={tiltOf(`note-${round.roundNo}`, 0.8)} className="rounded-element p-4 shadow-slip">
            <p className="font-display text-small">Narrator</p>
            {round.narration ? (
              <p className="script mt-1 text-[1.125rem] leading-[1.6] break-words md:text-lead">{round.narration}</p>
            ) : (
              <p className="script mt-1 text-body text-ink-notes">The narrator is still writing this part.</p>
            )}
          </PaperCard>
          {credited ? (
            <p className="mt-4 text-small leading-7 text-ink-notes">
              Written by{" "}
              <span className="text-ink">
                <Credits credit={round.credit} more={round.more} />
              </span>
            </p>
          ) : null}
        </div>
      </PaperCard>
      {last ? null : (
        <div className="flex justify-center py-3">
          <FatArrow direction="down" size={46} play={index < DRAWN_SCENES - 1} delayMs={sceneDelay(index) + 700} seed={`scene-arrow-${round.roundNo}`} />
        </div>
      )}
    </li>
  );
}

function Cast({ makers }: { makers: StoryRes["canonMakers"] }) {
  if (makers.length === 0) return null;
  return (
    <PaperCard as="section" aria-labelledby="canon-h" tilt={0.4} className="mx-auto mt-14 max-w-xl p-5 md:mt-16 md:p-7">
      <h2 id="canon-h" className={H2}>
        Cast
      </h2>
      <p className="mt-1 text-small text-ink-notes">The canon makers: people whose ideas won a round.</p>
      <ol className="mt-5 space-y-3">
        {makers.slice(0, 10).map((m, i) => (
          <li key={`${m.name}-${i}`} className="dp-cast-row">
            <span className="min-w-0 font-display text-lead leading-snug break-words">
              {m.name}
              {m.bot ? (
                <>
                  {" "}
                  <BotBadge />
                </>
              ) : null}
            </span>
            <span className="dp-leader" aria-hidden="true" />
            <span className="shrink-0 font-display text-small tabular-nums">
              <Swash>
                {m.count} {m.count === 1 ? "win" : "wins"}
              </Swash>
            </span>
          </li>
        ))}
      </ol>
    </PaperCard>
  );
}

/** "The Night the Ducks Won" -> the lead and the last word, which gets the yellow swash. */
function splitTitle(heading: string): { lead: string; marked: string } {
  const at = heading.trimEnd().lastIndexOf(" ");
  return at > 0 ? { lead: heading.slice(0, at + 1), marked: heading.slice(at + 1) } : { lead: "", marked: heading };
}

export default async function StoryPage({ params }: Params) {
  const { showId } = await params;
  const story = await loadStory(showId);
  if (!story) notFound();

  const { show, rounds, canonMakers } = story;
  const slots = await loadWinnerSlots(showId);
  const heading = storyHeading(show);
  const { lead, marked } = splitTitle(heading);
  const pending = recapPending(show);
  const finished = isFinished(show);
  const hasRecap = Boolean(show.recap && show.recap.trim());
  const tagline = show.tagline?.trim() ?? "";
  const when = show.startedAt ?? show.endedAt;

  return (
    <div className="flex min-h-dvh flex-col">
      <StageBackdrop />
      <div className="print:hidden">
        <SiteHeader />
      </div>
      <StoryRefresh active={pending} />

      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 pb-16 md:pb-24">
        <div className="flex flex-wrap items-center gap-3 pt-2 pb-9 print:hidden">
          <ShareButton title={heading} text={storyBlurb(show)} />
          <ButtonLink href="/host" variant="secondary">
            Host your own
          </ButtonLink>
        </div>

        <article>
          <header className="relative text-center">
            {show.isDemo ? <Ribbon kind="demo" size="md" className="absolute top-0 right-0 z-10 sm:right-4" /> : null}
            <p className="text-small text-ink-notes">{COPY.brand} presents</p>

            <h1 className="mt-4">
              <TitleBanner className="[--b-px:25] sm:[--b-px:36] md:[--b-px:46]">
                {lead}
                <Swash play delayMs={500}>
                  {marked}
                </Swash>
              </TitleBanner>
            </h1>

            {tagline ? (
              <p className="mx-auto mt-7 max-w-[32ch] text-[clamp(1.25rem,3.6vw,1.75rem)] leading-snug break-words text-ink-notes">{tagline}</p>
            ) : pending ? (
              <p className="mt-7 text-lead text-ink-notes">The narrator is writing the tagline…</p>
            ) : null}

            <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-small text-ink-notes">
              <li>{presetLabel(show)}</li>
              <li>{rounds.length === 0 ? "No scenes yet" : `${rounds.length} ${rounds.length === 1 ? "scene" : "scenes"}`}</li>
              {when ? (
                <li>
                  <time dateTime={new Date(when).toISOString()}>{formatDate(when)}</time>
                </li>
              ) : null}
              {!finished ? (
                <li>
                  <Pill size="sm">
                    <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-ink motion-reduce:animate-none" />
                    Still playing
                  </Pill>
                </li>
              ) : null}
            </ul>

            {show.isDemo ? (
              <PaperCard edge="wild" tilt={-0.6} className="mx-auto mt-7 flex max-w-[46ch] items-start gap-2 rounded-element px-4 py-3 text-left text-small shadow-slip">
                <span aria-hidden="true">🤖</span>
                <span>
                  <span className="font-display">Demo show.</span> The players in this story are simulated. Live shows use real people.
                </span>
              </PaperCard>
            ) : null}
          </header>

          <div className={`mt-14 grid gap-8 md:mt-16 ${hasRecap || pending ? "md:grid-cols-2" : "md:mx-auto md:max-w-xl"}`}>
            <PaperCard as="section" aria-labelledby="setup-h" tilt={-0.5} className="p-5 md:p-7">
              <h2 id="setup-h" className={H2}>
                The setup
              </h2>
              <p className="script mt-3 text-[1.125rem] leading-[1.6] break-words md:text-lead">{show.premise}</p>
            </PaperCard>

            {hasRecap ? (
              <PaperCard as="section" aria-labelledby="recap-h" alt tone="paper-2" tilt={0.5} className="p-5 md:p-7">
                <h2 id="recap-h" className={H2}>
                  The story, start to finish
                </h2>
                <p className="script mt-3 text-[1.125rem] leading-[1.6] break-words md:text-lead">{show.recap}</p>
              </PaperCard>
            ) : pending ? (
              <PaperCard as="section" aria-labelledby="recap-h" aria-busy="true" alt tone="paper-2" tilt={0.5} className="p-5 md:p-7">
                <h2 id="recap-h" className={H2}>
                  The story, start to finish
                </h2>
                <p role="status" className="mt-2 text-small text-ink-notes">
                  The narrator is writing the recap. This page updates by itself.
                </p>
                <SkeletonText lines={4} className="mt-4" />
              </PaperCard>
            ) : null}
          </div>

          <section aria-labelledby="rounds-h" className="mt-16 md:mt-20">
            <h2 id="rounds-h" className={`${H2} text-center`}>
              <InkUnderline seed="story-scenes">Scene by scene</InkUnderline>
            </h2>
            {rounds.length === 0 ? (
              <p className="mt-4 text-center text-ink-notes">Nothing has been revealed yet. Check back once the first scene is decided.</p>
            ) : (
              <ol className="mt-12">
                {rounds.map((r, i) => (
                  <Scene key={r.roundNo} round={r} slot={slots.get(r.roundNo)} index={i} last={i === rounds.length - 1} />
                ))}
              </ol>
            )}
          </section>

          <Cast makers={canonMakers} />

          <div className="mt-14 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t-2 border-dashed border-ink-faint pt-3 text-small text-ink-notes md:mt-16">
            <p className="min-w-0 break-words">{heading}</p>
            <p>Written live by the crowd on {COPY.brand}</p>
          </div>
        </article>

        <section aria-labelledby="cta-h" className="mt-16 text-center md:mt-24 print:hidden">
          <h2 id="cta-h" className="font-display text-h2 leading-tight text-balance">
            Your crowd could write the next one.
          </h2>
          <p className="mx-auto mt-3 max-w-[44ch] text-ink-notes">
            Pick a premise, share a code and let everyone type. You get a story like this one when the show ends.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/host" variant="secondary">
              Host your own
            </ButtonLink>
            <ButtonLink href="/try" variant="secondary">
              {COPY.landing.try.label}
            </ButtonLink>
          </div>
        </section>
      </main>

      <div className="print:hidden">
        <Footer />
      </div>
    </div>
  );
}
