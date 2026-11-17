"use client";
// PhaseHeader: the numbered banner ("2 Vote") with the scene count above it and the hand-drawn countdown, in a
// fixed-height row so phases never shift the layout. It also announces every phase change through an aria-live region,
// so pages get that for free.
//   <PhaseHeader state={state} offsetMs={offsetMs} />
// LOBBY and FINALE show no scene number (a plain title instead); phases without a deadline show an empty ring. The banner
// is placed (not slid) whenever the phase changes.
import { phaseAnnouncement, PHASE_LABEL } from "@/lib/copy";
import type { PublicState } from "@/lib/realtime/types";
import { Countdown } from "./Countdown";
import { cn } from "./cn";
import { LiveRegion } from "./LiveRegion";
import { NumberBanner } from "./Banner";

type Props = {
  state: Pick<PublicState, "phase" | "roundNo" | "roundsTotal" | "phaseStartedAt" | "phaseEndsAt" | "paused">;
  offsetMs: number;
  className?: string;
};

export function PhaseHeader({ state, offsetMs, className }: Props) {
  const showRound = state.phase !== "LOBBY" && state.phase !== "FINALE" && state.phase !== "ENDED";
  return (
    <header className={cn("flex h-[76px] items-center justify-between gap-4", className)}>
      <div className="min-w-0 flex-1">
        <p className="h-5 text-fine tabular-nums text-ink-notes">{showRound ? `Scene ${state.roundNo} of ${state.roundsTotal}` : null}</p>
        <div key={state.phase} className="placed mt-1 h-10 pl-3">
          {showRound ? (
            <NumberBanner n={state.roundNo} label={PHASE_LABEL[state.phase]} size="md" className="max-w-full" />
          ) : (
            <h2 className="truncate font-display text-h3 leading-10">{PHASE_LABEL[state.phase]}</h2>
          )}
        </div>
      </div>
      <Countdown endsAt={state.phaseEndsAt} startedAt={state.phaseStartedAt} offsetMs={offsetMs} paused={state.paused} size={56} />
      <LiveRegion message={phaseAnnouncement(state)} />
    </header>
  );
}
