"use client";
// The quiet phases: LOBBY (waiting room), PROMPT (the scene card), the PAUSED overlay and the loading skeleton.
import { Pause, Share2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { m } from "@/components/ui/motion";
import { SPRING, TRANSITION } from "@/components/ui/motionTokens";
import { PaperCard } from "@/components/ui/PaperCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { PRESETS } from "@/lib/presets";
import type { PublicState } from "@/lib/realtime/types";
import { PLAY_COPY } from "./playCopy";
import styles from "./play.module.css";

const TAG = "inline-flex items-center gap-1 rounded-pill border border-paper-edge bg-paper-2 px-2.5 py-1 text-fine font-semibold text-ink";

// ---------- LOBBY ----------

export function LobbyView({ state, onShare }: { state: PublicState; onShare: () => void }) {
  const preset = PRESETS[state.preset];
  const players = state.stats.players;
  return (
    <div className="flex h-full flex-col justify-center gap-5 overflow-y-auto overscroll-contain px-0.5 pt-1 pb-[var(--dock-pad,4px)]">
      <div className="text-center">
        <p role="status" className="inline-flex items-center gap-2 rounded-pill border border-stage-line bg-stage-1 px-4 py-2 text-small font-medium">
          <span aria-hidden="true" className={`size-2.5 rounded-full bg-light ${styles.pulseDot}`} />
          {PLAY_COPY.play.lobby.waiting}
        </p>
        <p className="mt-4 flex items-baseline justify-center gap-2" data-testid="player-count">
          <m.span
            key={players}
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={TRANSITION.fast}
            className="font-display text-[72px] leading-none font-extrabold text-on-stage tabular-nums"
          >
            {players}
          </m.span>
          <span className="text-lead text-muted-on-stage">{players === 1 ? "player in" : "players in"}</span>
        </p>
      </div>

      <PaperCard as="section" aria-labelledby="premise-title" className="p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {preset && state.preset !== "custom" ? (
            <span className={TAG}>
              <span aria-hidden="true">{preset.emoji}</span>
              {preset.name}
            </span>
          ) : null}
          {state.isDemo ? <span className={TAG}>Demo</span> : null}
        </div>
        <h2 id="premise-title" className="font-script text-[28px] leading-[1.1] font-semibold tracking-normal break-words text-ink">
          {state.title}
        </h2>
        <p className="mt-2 font-script text-body leading-relaxed text-ink">{state.premise}</p>
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
    <div className="flex h-full flex-col justify-center gap-6 overflow-y-auto overscroll-contain px-0.5 pt-1 pb-[var(--dock-pad,4px)]">
      <m.div initial={{ opacity: 0, y: 32, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={SPRING.land}>
        <PaperCard as="section" aria-labelledby="scene-title" className="overflow-hidden">
          <div
            aria-hidden="true"
            className="h-4 border-b border-paper-edge"
            style={{ background: "repeating-linear-gradient(-45deg, var(--ink) 0 14px, var(--paper) 14px 28px)" }}
          />
          <div className="px-5 pt-4 pb-5">
            <h2 id="scene-title" className="font-script text-[30px] leading-[1.1] font-semibold tracking-normal break-words text-ink">
              {title}
            </h2>
            <p className="mt-3 font-script text-body leading-[1.55] text-ink">{text}</p>
          </div>
        </PaperCard>
      </m.div>
      <m.p
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, ...TRANSITION.medium }}
        className="text-center font-display text-h1 font-extrabold text-on-stage"
      >
        {PLAY_COPY.play.prompt.question}
      </m.p>
    </div>
  );
}

// ---------- PAUSED ----------

export function PausedOverlay() {
  return (
    <m.div
      data-testid="paused-overlay"
      role="status"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={TRANSITION.fast}
      className="glass absolute inset-0 z-30 grid place-items-center border-0 p-6"
    >
      <div className="flex max-w-xs flex-col items-center gap-3 text-center">
        <span aria-hidden="true" className="grid size-16 place-items-center rounded-full bg-paper text-ink shadow-contact">
          <Pause className="size-8" fill="currentColor" />
        </span>
        <h2 className="font-display text-h2 leading-tight">{PLAY_COPY.play.paused.title}</h2>
        <p className="text-muted-on-stage">{PLAY_COPY.play.paused.body}</p>
      </div>
    </m.div>
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
          <Skeleton className="h-5 w-32" />
        </div>
        <Skeleton className="size-11 rounded-full" />
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
