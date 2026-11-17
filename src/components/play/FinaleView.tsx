"use client";
// FINALE / ENDED body, laid out as a small playbill on a paper page: the tagline, the story title, the recap, the cast
// list of canon makers (names, a dotted leader, their canon count) and "Your night" with my own numbers. Also the
// finale actions that live in the dock. Works for a show that ended while the player was away (state.finale can be
// missing, then the saved story fills in).
import Link from "next/link";
import { useEffect, useState } from "react";
import { BotBadge } from "@/components/ui/BotBadge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { PaperCard } from "@/components/ui/PaperCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { getMe, getStory } from "@/lib/client/api";
import type { MeRes } from "@/lib/api/contracts";
import type { PublicState } from "@/lib/realtime/types";
import { receiptCounts, RECAP_PENDING, topCanonMakers, type CanonMaker } from "./logic";
import { PLAY_COPY } from "./playCopy";

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

function Tile({ value, label, gold }: { value: number | null; label: string; gold?: boolean }) {
  const lit = gold && Boolean(value);
  return (
    <div className="px-1 text-center">
      <p className={cn("mx-auto inline-block min-w-12 rounded-element px-2 py-1 font-display text-[32px] leading-none font-extrabold tabular-nums", lit ? "bg-gold text-ink" : "text-ink")}>
        {value === null ? PLAY_COPY.play.finale.unknown : value}
      </p>
      <p className="mt-1.5 text-fine leading-tight text-ink-muted">{label}</p>
    </div>
  );
}

function Rule() {
  return (
    <div aria-hidden="true" className="my-5 flex items-center gap-3 text-ink-muted">
      <span className="h-px flex-1 bg-paper-edge" />
      <span className="size-1.5 rotate-45 bg-ink-muted" />
      <span className="h-px flex-1 bg-paper-edge" />
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

  return (
    <div className="h-full overflow-y-auto overscroll-contain px-0.5 pt-2 pb-[var(--dock-pad,8px)]">
      <PaperCard as="article" className="px-5 py-6">
        <p className="text-center font-script text-small text-ink-muted italic">{tagline || PLAY_COPY.play.finale.wrap}</p>
        <h2 data-testid="finale-title" className="mt-2 text-center font-script text-[32px] leading-[1.08] font-semibold tracking-normal break-words text-ink">
          {title}
        </h2>

        <section aria-labelledby="your-night" className="mt-4 rounded-card bg-paper-2 px-2 py-3">
          <h3 id="your-night" className="text-center font-display text-body">
            {PLAY_COPY.play.finale.yourNight}
          </h3>
          {night === "loading" ? (
            <div className="mt-2 grid grid-cols-3 gap-2" role="status">
              <span className="sr-only">{PLAY_COPY.play.loading}</span>
              <Skeleton tone="paper" className="h-[62px]" />
              <Skeleton tone="paper" className="h-[62px]" />
              <Skeleton tone="paper" className="h-[62px]" />
            </div>
          ) : (
            <div data-testid="my-stats" className="mt-2 grid grid-cols-3 gap-2 divide-x divide-paper-edge">
              <Tile value={night.ideas} label={PLAY_COPY.play.finale.ideas} />
              <Tile value={night.ballots} label={PLAY_COPY.play.finale.ballot} />
              <Tile value={night.canon} label={PLAY_COPY.play.finale.canon} gold />
            </div>
          )}
        </section>

        {writing ? (
          <div role="status" className="mt-4 space-y-2.5">
            <p className="text-small text-ink-muted">{PLAY_COPY.play.finale.writing}</p>
            <Skeleton tone="paper" className="h-4 w-full" />
            <Skeleton tone="paper" className="h-4 w-[94%]" />
            <Skeleton tone="paper" className="h-4 w-2/3" />
          </div>
        ) : recap ? (
          <p data-testid="finale-recap" className="mt-4 font-script text-[16px] leading-[1.65] text-ink">
            {recap}
          </p>
        ) : null}
        <p className="mt-1 text-center">
          <Link href={`/story/${state.showId}`} className="inline-flex min-h-11 items-center text-small font-semibold text-ink underline decoration-ink-muted underline-offset-4">
            {PLAY_COPY.play.finale.readStory}
          </Link>
        </p>

        <Rule />

        <section aria-labelledby="canon-makers">
          <h3 id="canon-makers" className="text-center font-display text-lead">
            {PLAY_COPY.play.finale.canonMakers}
          </h3>
          {makers.length === 0 ? (
            <p className="mt-2 text-center text-small text-ink-muted">{PLAY_COPY.play.finale.noCanon}</p>
          ) : (
            <ol data-testid="canon-makers" className="mt-3 space-y-2">
              {makers.map((c, i) => {
                const me = meName !== null && c.name === meName && !c.bot;
                return (
                  <li key={`${c.name}:${i}`} className="flex min-h-8 items-end gap-2 text-small">
                    <span className="flex min-w-0 items-center gap-1.5 font-semibold text-ink">
                      <span className="truncate">{c.name}</span>
                      {c.bot ? <BotBadge /> : null}
                      {me ? <span className="shrink-0 rounded-pill bg-gold px-2 py-0.5 text-fine font-bold text-ink">{PLAY_COPY.play.finale.you}</span> : null}
                    </span>
                    <span aria-hidden="true" className="mb-1.5 min-w-4 flex-1 border-b border-dotted border-ink-muted" />
                    <span className="shrink-0 text-ink-muted tabular-nums">
                      {c.count} {PLAY_COPY.play.finale.canon.toLowerCase()}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </PaperCard>
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
