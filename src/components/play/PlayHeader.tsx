"use client";
// The player's header: round, phase name and the countdown ring in one 56 px row (about 6.6 % of an 844 px phone).
// The phase name swaps with mode="wait": the old one leaves in 175 ms, then the new one arrives, so two headings
// never overlap (audit #14). The ring is hidden for phases without a deadline instead of showing an empty circle
// (FINALE, audit #13); its slot keeps the row's width. The aria-live announcement of every phase change lives here too.
import { Languages } from "lucide-react";
import { Countdown } from "@/components/ui/Countdown";
import { cn } from "@/components/ui/cn";
import { LiveRegion } from "@/components/ui/LiveRegion";
import { AnimatePresence, m } from "@/components/ui/motion";
import { EASE, TRANSITION } from "@/components/ui/motionTokens";
import { phaseAnnouncement, PHASE_LABEL } from "@/lib/copy";
import type { PublicState } from "@/lib/realtime/types";
import { PLAY_COPY } from "./playCopy";

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
  return (
    <header className="relative flex h-14 shrink-0 items-center gap-3 px-4">
      <div className="min-w-0 flex-1">
        <p className="flex h-4 items-center gap-1.5 text-fine leading-none font-medium tabular-nums text-muted-on-stage">
          {showRound ? (
            <>
              <span aria-hidden="true" className="size-1.5 rounded-full bg-light" />
              {`Round ${state.roundNo} / ${state.roundsTotal}`}
            </>
          ) : null}
        </p>
        <div className="relative h-7">
          <AnimatePresence mode="wait" initial={false}>
            <m.h2
              key={state.phase}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: TRANSITION.medium }}
              exit={{ opacity: 0, y: -6, transition: { duration: 0.175, ease: EASE.exit } }}
              className="truncate font-display text-lead leading-7 font-extrabold"
            >
              {PHASE_LABEL[state.phase]}
            </m.h2>
          </AnimatePresence>
        </div>
      </div>

      {translate ? (
        <button
          type="button"
          data-testid="translate-toggle"
          aria-pressed={translate.showOriginal}
          onClick={translate.onToggle}
          className={cn(
            "press relative inline-flex h-7 shrink-0 items-center gap-1 rounded-pill border border-stage-line bg-stage-1 px-2.5 text-fine font-medium text-muted-on-stage",
            "before:absolute before:-inset-y-2 before:-inset-x-1 before:content-['']",
          )}
        >
          <Languages aria-hidden="true" className="size-3.5" />
          {translate.showOriginal ? PLAY_COPY.play.translate : PLAY_COPY.play.original}
        </button>
      ) : null}

      <div className="grid shrink-0 place-items-center" style={{ width: RING, height: RING }}>
        {hasRing ? <Countdown endsAt={state.phaseEndsAt} startedAt={state.phaseStartedAt} offsetMs={offsetMs} paused={state.paused} size={RING} /> : null}
      </div>
      <LiveRegion message={phaseAnnouncement(state)} />
    </header>
  );
}
