"use client";
// The quiet phases: LOBBY (waiting room), PROMPT (scene card), the PAUSED overlay and the loading skeleton.
import { Pause, Share2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { m } from "@/components/ui/motion";
import { Pill } from "@/components/ui/Pill";
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
    <div className="flex h-full flex-col justify-center gap-5 overflow-y-auto overscroll-contain py-1">
      <div className="text-center">
        <p role="status" className="inline-flex items-center gap-2 rounded-pill border border-line bg-surface px-4 py-2 text-sm font-medium">
          <span aria-hidden="true" className={`size-2.5 rounded-full bg-accent ${styles.pulseDot}`} />
          {PLAY_COPY.play.lobby.waiting}
        </p>
        <p className="mt-4 flex items-baseline justify-center gap-2" data-testid="player-count">
          <m.span
            key={players}
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.25 }}
            className="font-display text-6xl leading-none font-extrabold text-accent tabular-nums"
          >
            {players}
          </m.span>
          <span className="text-lg text-muted">{players === 1 ? "player in" : "players in"}</span>
        </p>
      </div>

      <Card tone="raised" as="section" aria-labelledby="premise-title" className="p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {preset && state.preset !== "custom" ? (
            <Pill size="sm">
              <span aria-hidden="true">{preset.emoji}</span>
              {preset.name}
            </Pill>
          ) : null}
          {state.isDemo ? (
            <Pill size="sm" tone="wild">
              Demo
            </Pill>
          ) : null}
        </div>
        <h2 id="premise-title" className="font-display text-2xl leading-tight break-words">
          {state.title}
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-text/85">{state.premise}</p>
      </Card>

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
    <div className="flex h-full flex-col justify-center gap-5 overflow-y-auto overscroll-contain py-1">
      <m.section
        aria-labelledby="scene-title"
        initial={{ opacity: 0, y: 28, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 240, damping: 24 }}
        className="overflow-hidden rounded-card border border-line bg-surface-2"
      >
        <div
          aria-hidden="true"
          className="h-3.5 border-b border-line"
          style={{ background: "repeating-linear-gradient(-45deg, var(--text) 0 12px, var(--bg) 12px 24px)", opacity: 0.9 }}
        />
        <div className="p-5">
          <h2 id="scene-title" className="font-display text-[28px] leading-[1.08] break-words">
            {title}
          </h2>
          <p className="mt-3 text-[16px] leading-relaxed text-text/90">{text}</p>
        </div>
      </m.section>
      <m.p
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="text-center font-display text-4xl leading-none font-extrabold text-accent"
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
      transition={{ duration: 0.2 }}
      className="absolute inset-0 z-30 grid place-items-center bg-bg/85 p-6 backdrop-blur-sm"
    >
      <div className="flex max-w-xs flex-col items-center gap-3 text-center">
        <span aria-hidden="true" className="grid size-16 place-items-center rounded-full border border-line bg-surface-2 text-accent">
          <Pause className="size-8" fill="currentColor" />
        </span>
        <h2 className="font-display text-3xl leading-tight">{PLAY_COPY.play.paused.title}</h2>
        <p className="text-muted">{PLAY_COPY.play.paused.body}</p>
      </div>
    </m.div>
  );
}

// ---------- loading ----------

export function PlayerSkeleton() {
  return (
    <div role="status" className="flex h-full min-h-0 flex-col">
      <span className="sr-only">{PLAY_COPY.play.loading}</span>
      <div className="flex h-[72px] shrink-0 items-center justify-between px-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-36" />
        </div>
        <Skeleton className="size-14 rounded-full" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-4">
        <Skeleton className="h-20 w-full rounded-card" />
        <Skeleton className="h-10 w-3/4 rounded-card" />
        <Skeleton className="ml-auto h-10 w-2/3 rounded-card" />
        <Skeleton className="h-10 w-1/2 rounded-card" />
      </div>
      <div className="shrink-0 space-y-2 px-4 pt-2 pb-4">
        <Skeleton className="h-11 w-full rounded-pill" />
        <Skeleton className="h-[76px] w-full rounded-card" />
      </div>
    </div>
  );
}
