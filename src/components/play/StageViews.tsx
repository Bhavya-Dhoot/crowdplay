"use client";
// The quiet phases: LOBBY (waiting room), PROMPT (the scene note), the PAUSED overlay and the loading skeleton.
import { Pause, Share2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { InkUnderline } from "@/components/ui/InkUnderline";
import { PaperCard } from "@/components/ui/PaperCard";
import { PenLoop } from "@/components/ui/PenLoop";
import { Pill } from "@/components/ui/Pill";
import { Ribbon } from "@/components/ui/Ribbon";
import { Skeleton } from "@/components/ui/Skeleton";
import { PRESETS } from "@/lib/presets";
import type { PublicState } from "@/lib/realtime/types";
import { PLAY_COPY } from "./playCopy";
import styles from "./play.module.css";

// ---------- LOBBY ----------

export function LobbyView({ state, onShare }: { state: PublicState; onShare: () => void }) {
  const preset = PRESETS[state.preset];
  const players = state.stats.players;
  return (
    <div className="flex h-full flex-col justify-center gap-7 overflow-y-auto overscroll-contain px-2 pt-3 pb-[var(--dock-pad,4px)]">
      <div className="text-center">
        <p role="status" className="slip inline-flex items-center gap-2 rounded-pill px-4 py-2 text-body">
          <span aria-hidden="true" className={cn("size-2.5 rounded-full bg-ink", styles.pulseDot)} />
          {PLAY_COPY.play.lobby.waiting}
        </p>
        <p className="mt-7 flex items-center justify-center gap-4" data-testid="player-count">
          <PenLoop seed="lobby-count" className="mx-3 px-1">
            <span className="block min-w-10 text-center font-display text-display leading-none tabular-nums">{players}</span>
          </PenLoop>
          <span className="text-lead text-ink-notes">{players === 1 ? "player in" : "players in"}</span>
        </p>
      </div>

      <PaperCard as="section" aria-labelledby="premise-title" tilt={-0.6} className={cn("rounded-card p-5", styles.tape)}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {preset && state.preset !== "custom" ? <Pill size="sm">{preset.name}</Pill> : null}
          {state.isDemo ? <Ribbon kind="demo" size="sm" className="-ml-1" /> : null}
        </div>
        <h2 id="premise-title" className="font-display text-h2 leading-[1.1] break-words">
          {state.title}
        </h2>
        <p className="mt-2 text-body leading-relaxed text-ink">{state.premise}</p>
      </PaperCard>

      <Button variant="secondary" block onClick={onShare} data-testid="share-room">
        <Share2 aria-hidden="true" className="size-5" />
        {PLAY_COPY.play.lobby.share}
      </Button>
    </div>
  );
}

// ---------- PROMPT ----------

export function PromptView({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex h-full flex-col justify-center gap-8 overflow-y-auto overscroll-contain px-2 pt-3 pb-[var(--dock-pad,4px)]">
      <PaperCard as="section" aria-labelledby="scene-title" tilt={-0.8} className={cn("placed rounded-card px-5 pt-6 pb-5", styles.tape)}>
        <h2 id="scene-title" className="font-display text-h2 leading-[1.1] break-words">
          {title}
        </h2>
        <p className="mt-3 text-body leading-[1.55] text-ink">{text}</p>
      </PaperCard>
      <p className="text-center font-display text-h2">
        <InkUnderline delayMs={500} seed="prompt-question">
          {PLAY_COPY.play.prompt.question}
        </InkUnderline>
      </p>
    </div>
  );
}

// ---------- PAUSED ----------

export function PausedOverlay() {
  return (
    <div data-testid="paused-overlay" role="status" className={cn("dot-grid absolute inset-0 z-30 grid place-items-center p-6", styles.settle)}>
      <div className="flex max-w-xs flex-col items-center gap-3 text-center">
        <span aria-hidden="true" className="slip grid size-16 place-items-center rounded-blob">
          <Pause className="size-8" fill="currentColor" />
        </span>
        <h2 className="font-display text-h2 leading-tight">{PLAY_COPY.play.paused.title}</h2>
        <p className="text-body text-ink-notes">{PLAY_COPY.play.paused.body}</p>
      </div>
    </div>
  );
}

// ---------- loading ----------

export function PlayerSkeleton() {
  return (
    <div role="status" className="flex h-full min-h-0 flex-col">
      <span className="sr-only">{PLAY_COPY.play.loading}</span>
      <div className="flex h-14 shrink-0 items-center justify-between px-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-32" />
        </div>
        <Skeleton className="size-11 rounded-blob" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-4">
        <Skeleton className="h-16 w-full rounded-card" />
        <Skeleton className="h-11 w-3/4 rounded-card" />
        <Skeleton className="ml-auto h-11 w-2/3 rounded-card" />
        <Skeleton className="h-11 w-1/2 rounded-card" />
      </div>
      <div className="shrink-0 px-3 pt-2 pb-4">
        <Skeleton className="h-[116px] w-full rounded-sheet" />
      </div>
    </div>
  );
}
