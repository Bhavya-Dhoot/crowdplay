"use client";
// FINALE / ENDED body: the story as a small sketchnote poster on the dot-grid page. The pen writes it top to bottom: a
// "That's a wrap" banner, the story title, one numbered box per scene joined by yellow fat arrows (the state keeps the
// last three beats), the narrator's recap on a taped note, "Your night" (ideas sent -> on the ballot -> canon, joined by
// arrows, the canon count under the yellow marker) and the canon makers. Also the finale actions that live in the dock.
// Works for a show that ended while the player was away (state.finale can be missing, then the saved story fills in).
import Link from "next/link";
import { useEffect, useState } from "react";
import { BotBadge } from "@/components/ui/BotBadge";
import { NumberBanner } from "@/components/ui/Banner";
import { Button, ButtonLink } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { FatArrow } from "@/components/ui/FatArrow";
import { InkUnderline } from "@/components/ui/InkUnderline";
import { PaperCard } from "@/components/ui/PaperCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { Swash } from "@/components/ui/Swash";
import { getMe, getStory } from "@/lib/client/api";
import type { MeRes } from "@/lib/api/contracts";
import type { PublicState } from "@/lib/realtime/types";
import { receiptCounts, RECAP_PENDING, sceneNumber, topCanonMakers, type CanonMaker } from "./logic";
import { PLAY_COPY } from "./playCopy";
import styles from "./play.module.css";

type Night = { ideas: number | null; ballots: number | null; canon: number | null };

/** The player's own numbers for this show. Receipts are exact per show; ideas are only exact when this was their only show. */
function useNight(showId: string, ideasSentHere: number): Night | "loading" {
  const [data, setData] = useState<Extract<MeRes, { ok: true }> | null | "failed">(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const r = await getMe();
      if (alive) setData(r.ok ? r : "failed");
    };
    void load();
    // Last-round receipts can land a moment after the finale starts.
    const t = setTimeout(() => void load(), 3000);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [showId]);

  if (data === null) return "loading";
  if (data === "failed") return { ideas: ideasSentHere > 0 ? ideasSentHere : null, ballots: null, canon: null };
  const c = receiptCounts(data.receipts, showId);
  return { ideas: data.stats.shows <= 1 ? data.stats.ideas : ideasSentHere, ballots: c.ballots, canon: c.canon };
}

function Tile({ value, label, hot }: { value: number | null; label: string; hot?: boolean }) {
  const text = value === null ? PLAY_COPY.play.finale.unknown : value;
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center rounded-element border-2 border-ink bg-paper-raised px-1 py-3 text-center">
      <p className="font-display text-h2 leading-none tabular-nums">{hot && value ? <Swash play delayMs={900}>{text}</Swash> : text}</p>
      <p className="mt-2 text-fine leading-tight text-ink-notes">{label}</p>
    </div>
  );
}

type Story = { title: string; tagline: string; recap: string; makers: CanonMaker[] };

export function FinaleView({ state, meName, ideasSentHere }: { state: PublicState; meName: string | null; ideasSentHere: number }) {
  const [story, setStory] = useState<Story | null>(null);
  const hasFinale = Boolean(state.finale);

  // A show that ended before the finale was written (or while we were away): read the saved story.
  useEffect(() => {
    if (hasFinale) return;
    let alive = true;
    void getStory(state.showId).then((r) => {
      if (!alive || !r.ok) return;
      setStory({ title: r.show.storyTitle ?? r.show.title, tagline: r.show.tagline ?? "", recap: r.show.recap ?? "", makers: r.canonMakers });
    });
    return () => {
      alive = false;
    };
  }, [hasFinale, state.showId]);

  const f = state.finale;
  const title = f?.storyTitle || story?.title || state.title;
  const tagline = f ? f.tagline : (story?.tagline ?? "");
  const recap = f ? f.recap : (story?.recap ?? "");
  const writing = hasFinale && RECAP_PENDING(f?.recap);
  const makers = topCanonMakers(f?.canonMakers ?? story?.makers ?? [], 5);
  const night = useNight(state.showId, ideasSentHere);
  const beats = state.storySoFar.slice(-3);

  return (
    <div className="h-full overflow-y-auto overscroll-contain px-2 pt-4 pb-[var(--dock-pad,8px)]">
      <div className="text-center">
        <h2 data-testid="finale-title" className="mt-2 font-display text-h2 leading-[1.1] break-words">
          {title}
        </h2>
        <p className="mx-auto mt-2 max-w-[32ch] text-body text-ink-notes">{tagline}</p>
      </div>

      {beats.length > 0 ? (
        <ol aria-label={PLAY_COPY.play.finale.scenes} className="mt-9 flex flex-col items-center">
          {beats.map((beat, i) => {
            const at = 300 + i * 650;
            return (
              <li key={`${i}:${beat}`} className="flex w-full flex-col items-center">
                <PaperCard className="relative w-full rounded-card px-4 pt-7 pb-4 text-body leading-snug break-words">
                  <NumberBanner n={sceneNumber(i, beats.length, state.roundNo)} label={PLAY_COPY.play.finale.scene} size="sm" play delayMs={at} className="absolute -top-4 left-2" />
                  {beat}
                </PaperCard>
                {i < beats.length - 1 ? <FatArrow direction="down" size={38} delayMs={at + 450} seed={`finale-arrow-${i}`} className="my-2" /> : null}
              </li>
            );
          })}
        </ol>
      ) : null}

      {writing ? (
        <div role="status" className="mt-9 space-y-2.5">
          <p className="text-body text-ink-notes">{PLAY_COPY.play.finale.writing}</p>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-[94%]" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : recap ? (
        <PaperCard as="section" tone="paper-2" tilt={-0.6} className={cn("mt-9 rounded-card px-5 py-4", styles.tape)}>
          <p data-testid="finale-recap" className="text-body leading-[1.65] text-ink">
            {recap}
          </p>
        </PaperCard>
      ) : null}
      <p className="mt-2 text-center">
        <Link href={`/story/${state.showId}`} className="inline-flex min-h-11 items-center font-display text-body text-ink">
          <InkUnderline play={false} seed="finale-story">
            {PLAY_COPY.play.finale.readStory}
          </InkUnderline>
        </Link>
      </p>

      <section aria-labelledby="your-night" className="mt-7">
        <h3 id="your-night" className="mb-3 text-center font-display text-lead">
          {PLAY_COPY.play.finale.yourNight}
        </h3>
        {night === "loading" ? (
          <div className="flex items-center gap-2" role="status">
            <span className="sr-only">{PLAY_COPY.play.loading}</span>
            <Skeleton className="h-[84px] flex-1" />
            <Skeleton className="h-[84px] flex-1" />
            <Skeleton className="h-[84px] flex-1" />
          </div>
        ) : (
          <div data-testid="my-stats" className="flex items-center gap-1.5">
            <Tile value={night.ideas} label={PLAY_COPY.play.finale.ideas} />
            <FatArrow size={24} play={false} seed="night-1" />
            <Tile value={night.ballots} label={PLAY_COPY.play.finale.ballot} />
            <FatArrow size={24} play={false} seed="night-2" />
            <Tile value={night.canon} label={PLAY_COPY.play.finale.canon} hot />
          </div>
        )}
      </section>

      <section aria-labelledby="canon-makers" className="mt-9">
        <PaperCard className="rounded-card px-5 py-4">
          <h3 id="canon-makers" className="text-center font-display text-lead">
            {PLAY_COPY.play.finale.canonMakers}
          </h3>
          {makers.length === 0 ? (
            <p className="mt-2 text-center text-body text-ink-notes">{PLAY_COPY.play.finale.noCanon}</p>
          ) : (
            <ol data-testid="canon-makers" className="mt-3 space-y-2">
              {makers.map((c, i) => {
                const me = meName !== null && c.name === meName && !c.bot;
                return (
                  <li key={`${c.name}:${i}`} className="flex min-h-8 items-end gap-2 text-body">
                    <span className="flex min-w-0 items-center gap-1.5 text-ink">
                      <span className="truncate">{c.name}</span>
                      {c.bot ? <BotBadge /> : null}
                      {me ? <Swash className="shrink-0 font-display text-fine">{PLAY_COPY.play.finale.you}</Swash> : null}
                    </span>
                    <span aria-hidden="true" className="mb-1.5 min-w-4 flex-1 border-b-2 border-dotted border-ink-faint" />
                    <span className="shrink-0 text-ink-notes tabular-nums">
                      {c.count} {PLAY_COPY.play.finale.canon.toLowerCase()}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </PaperCard>
      </section>
    </div>
  );
}

export function FinaleActions({ showId, onShare }: { showId: string; onShare: (showId: string) => void }) {
  return (
    <div className="flex h-14 items-center gap-2">
      <Button block data-testid="share-story" onClick={() => onShare(showId)}>
        {PLAY_COPY.play.finale.shareStory}
      </Button>
      <ButtonLink block variant="secondary" href="/me" data-testid="see-receipts">
        {PLAY_COPY.play.finale.receipts}
      </ButtonLink>
    </div>
  );
}
