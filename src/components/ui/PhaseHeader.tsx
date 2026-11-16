"use client";
// PhaseHeader: "Round 2 / 6", the phase label and the circular countdown, in a fixed-height row
// so phases never shift the layout. It also announces every phase change through an aria-live
// region, so pages get that for free.
//   <PhaseHeader state={state} offsetMs={offsetMs} />
// LOBBY and FINALE show no round number; phases without a deadline show an empty ring.
import { phaseAnnouncement, PHASE_LABEL } from "@/lib/copy";
import type { PublicState } from "@/lib/realtime/types";
import { Countdown } from "./Countdown";
import { cn } from "./cn";
import { LiveRegion } from "./LiveRegion";
import { AnimatePresence, m, MotionScope, PHASE_TRANSITION } from "./motion";

type Props = {
  state: Pick<PublicState, "phase" | "roundNo" | "roundsTotal" | "phaseStartedAt" | "phaseEndsAt" | "paused">;
  offsetMs: number;
  className?: string;
};

export function PhaseHeader({ state, offsetMs, className }: Props) {
  const showRound = state.phase !== "LOBBY" && state.phase !== "FINALE" && state.phase !== "ENDED";
  return (
    <MotionScope>
      <header className={cn("flex h-[72px] items-center justify-between gap-4", className)}>
        <div className="relative min-w-0 flex-1">
          <p className="h-5 text-sm font-medium tabular-nums text-muted">{showRound ? `Round ${state.roundNo} / ${state.roundsTotal}` : ""}</p>
          <div className="relative h-8">
            <AnimatePresence mode="popLayout" initial={false}>
              <m.h2
                key={state.phase}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={PHASE_TRANSITION}
                className="truncate font-display text-2xl leading-8 font-extrabold"
              >
                {PHASE_LABEL[state.phase]}
              </m.h2>
            </AnimatePresence>
          </div>
        </div>
        <Countdown endsAt={state.phaseEndsAt} startedAt={state.phaseStartedAt} offsetMs={offsetMs} paused={state.paused} size={56} />
        <LiveRegion message={phaseAnnouncement(state)} />
      </header>
    </MotionScope>
  );
}
