"use client";
// FINALE / ENDED body: the story recap, the top canon makers and "your night". Also the finale actions
// that live in the dock. Works for a show that ended while the player was away (state.finale can be
// missing, then the saved story fills in).
import { Share2, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { BotBadge } from "@/components/ui/BotBadge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
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

function Tile({ value, label, tone }: { value: number | null; label: string; tone?: "accent" }) {
  return (
    <div className={cn("rounded-card border bg-surface px-2 py-3 text-center", tone === "accent" && value ? "border-accent" : "border-line")}>
      <p className={cn("font-display text-3xl leading-none font-extrabold tabular-nums", tone === "accent" && value ? "text-accent" : "")}>
        {value === null ? PLAY_COPY.play.finale.unknown : value}
      </p>
      <p className="mt-1.5 text-xs leading-tight text-muted">{label}</p>
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
    <div className="h-full overflow-y-auto overscroll-contain pb-2">
      <p className="text-sm text-muted">{tagline || PLAY_COPY.play.finale.wrap}</p>
      <h2 data-testid="finale-title" className="mt-1 font-display text-[32px] leading-[1.05] break-words">
        {title}
      </h2>
      {writing ? (
        <div role="status" className="mt-4 space-y-2.5">
          <p className="text-sm text-muted">{PLAY_COPY.play.finale.writing}</p>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-[94%]" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : recap ? (
        <p data-testid="finale-recap" className="mt-4 text-[16px] leading-relaxed text-text/90">
          {recap}
        </p>
      ) : null}
      <p className="mt-2">
        <Link href={`/story/${state.showId}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline-offset-4 hover:underline">
          {PLAY_COPY.play.finale.readStory}
        </Link>
      </p>

      <section aria-labelledby="canon-makers" className="mt-3">
        <h3 id="canon-makers" className="flex items-center gap-2 font-display text-xl">
          <Trophy aria-hidden="true" className="size-5 text-accent" />
          {PLAY_COPY.play.finale.canonMakers}
        </h3>
        {makers.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{PLAY_COPY.play.finale.noCanon}</p>
        ) : (
          <ol data-testid="canon-makers" className="mt-2 space-y-2">
            {makers.map((c, i) => {
              const me = meName !== null && c.name === meName && !c.bot;
              return (
                <li
                  key={`${c.name}:${i}`}
                  className={cn("flex items-center gap-3 rounded-card border px-3 py-2.5", me ? "border-accent bg-surface-2" : "border-line bg-surface")}
                >
                  <span className="w-5 text-center font-display text-lg font-extrabold text-muted tabular-nums">{i + 1}</span>
                  <Avatar name={c.name} size={32} />
                  <span className="flex min-w-0 flex-1 items-center gap-1.5 font-medium">
                    <span className="truncate">{c.name}</span>
                    {c.bot ? <BotBadge /> : null}
                    {me ? <span className="shrink-0 rounded-pill bg-accent px-2 py-0.5 text-xs font-bold text-ink">{PLAY_COPY.play.finale.you}</span> : null}
                  </span>
                  <span className="text-sm text-muted tabular-nums">
                    {c.count} {PLAY_COPY.play.finale.canon.toLowerCase()}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section aria-labelledby="your-night" className="mt-4">
        <h3 id="your-night" className="font-display text-xl">
          {PLAY_COPY.play.finale.yourNight}
        </h3>
        {night === "loading" ? (
          <div className="mt-2 grid grid-cols-3 gap-2" role="status">
            <span className="sr-only">{PLAY_COPY.play.loading}</span>
            <Skeleton className="h-[76px]" />
            <Skeleton className="h-[76px]" />
            <Skeleton className="h-[76px]" />
          </div>
        ) : (
          <div data-testid="my-stats" className="mt-2 grid grid-cols-3 gap-2">
            <Tile value={night.ideas} label={PLAY_COPY.play.finale.ideas} />
            <Tile value={night.ballots} label={PLAY_COPY.play.finale.ballot} />
            <Tile value={night.canon} label={PLAY_COPY.play.finale.canon} tone="accent" />
          </div>
        )}
      </section>
    </div>
  );
}

export function FinaleActions({ showId, onShare }: { showId: string; onShare: (showId: string) => void }) {
  return (
    <div className="flex h-[116px] flex-col gap-2 pt-1">
      <Button block data-testid="share-story" onClick={() => onShare(showId)}>
        <Share2 aria-hidden="true" className="size-5" />
        {PLAY_COPY.play.finale.shareStory}
      </Button>
      <ButtonLink block variant="secondary" href="/me" data-testid="see-receipts">
        {PLAY_COPY.play.finale.receipts}
      </ButtonLink>
    </div>
  );
}
