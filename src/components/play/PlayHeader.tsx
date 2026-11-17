"use client";
// The player's header: "Scene 1 of 3" over the numbered banner ("1 Ideas") and the hand-drawn countdown, in one 56 px
// row (about 6.6 % of an 844 px phone). The banner is drawn again whenever the phase changes (its outline, then the
// word), so two phase names never overlap (audit #14). The ring is hidden for phases without a deadline instead of
// showing an empty circle (FINALE, audit #13); its slot keeps the row's width. LOBBY and FINALE have no scene number, so
// they get a plain paper banner (yellow is reserved for the numbered ones). The aria-live announcement of every phase
// change lives here too.
import { Languages } from "lucide-react";
import { Banner, NumberBanner } from "@/components/ui/Banner";
import { Countdown } from "@/components/ui/Countdown";
import { cn } from "@/components/ui/cn";
import { LiveRegion } from "@/components/ui/LiveRegion";
import { phaseAnnouncement } from "@/lib/copy";
import type { PublicState } from "@/lib/realtime/types";
import { PLAY_COPY } from "./playCopy";
import styles from "./play.module.css";

type Props = {
  state: Pick<PublicState, "phase" | "roundNo" | "roundsTotal" | "phaseStartedAt" | "phaseEndsAt" | "paused">;
  offsetMs: number;
  /** Shown when a translation exists for this player's language. */
  translate?: { showOriginal: boolean; onToggle: () => void } | null;
};

const RING = 44;

export function PlayHeader({ state, offsetMs, translate }: Props) {
  const showRound = state.phase !== "LOBBY" && state.phase !== "FINALE" && state.phase !== "ENDED";
  const hasRing = state.phaseEndsAt !== null;
  const tag = PLAY_COPY.play.tag[state.phase];
  const toggleLabel = translate ? (translate.showOriginal ? PLAY_COPY.play.translate : PLAY_COPY.play.original) : "";
  return (
    <header className="relative flex h-14 shrink-0 items-center gap-3 px-4 pt-1">
      <div className="min-w-0 flex-1">
        <p className="flex h-4 items-center pl-3 text-fine leading-none tabular-nums text-ink-notes">
          {showRound ? PLAY_COPY.play.scene(state.roundNo, state.roundsTotal) : null}
        </p>
        <h2 key={`${state.phase}:${state.roundNo}`} className={cn("mt-0.5 flex h-8 items-center pl-3", styles.settle)}>
          {showRound ? <NumberBanner n={state.roundNo} label={tag} size="sm" play /> : <Banner size="sm" play>{tag}</Banner>}
        </h2>
      </div>

      {translate ? (
        <button
          type="button"
          data-testid="translate-toggle"
          aria-pressed={translate.showOriginal}
          aria-label={toggleLabel}
          title={toggleLabel}
          onClick={translate.onToggle}
          className="press grid size-11 shrink-0 place-items-center rounded-blob border-2 border-ink bg-paper-raised text-ink"
        >
          <Languages aria-hidden="true" className="size-5" />
        </button>
      ) : null}

      <div className="grid shrink-0 place-items-center" style={{ width: RING, height: RING }}>
        {hasRing ? <Countdown endsAt={state.phaseEndsAt} startedAt={state.phaseStartedAt} offsetMs={offsetMs} paused={state.paused} size={RING} /> : null}
      </div>
      <LiveRegion message={phaseAnnouncement(state)} />
    </header>
  );
}
