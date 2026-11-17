"use client";
// The guided tips of Judge Mode, as paper slips with washi tape and a small numbered banner ("1 of 3"), never on the
// options or on the judge's own idea.
//
// PlayerView calls its `coach` slot with the current step ("type" -> "watch" -> "vote") and floats whatever it
// returns just above the composer, which on VOTE is the bottom card. So the slot only gets <CoachReporter>, which
// renders nothing and reports the step up; <CoachStrip> then draws the note in a row of its own under the phone
// (below the phone, outside it: the receipt toasts sit at the top of the phone and would cover a note there; its height
// is reserved through round 1, so nothing on the phone ever moves when a note comes or goes).
// Each note shows once: when the step moves on (or the judge dismisses it) it does not come back in the next round.
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import type { CoachStep } from "@/components/play/PlayerView";
import { cn } from "@/components/ui/cn";
import { NumberBanner } from "@/components/ui/Banner";
import { AnimatePresence, m } from "@/components/ui/motion";
import { DURATION, EASE } from "@/components/ui/motionTokens";
import { PaperCard } from "@/components/ui/PaperCard";
import { Tape } from "./Tape";
import { TRY_COPY, type TryCoachStep } from "./tryCopy";

/** Render-nothing child of PlayerView's coach slot: hands the current step to the page. */
export function CoachReporter({ step, onStep }: { step: CoachStep | null; onStep: (step: CoachStep | null) => void }) {
  useEffect(() => {
    onStep(step);
  }, [step, onStep]);
  return null;
}

const GUIDED_PHASES = new Set(["PROMPT", "STORM", "DISTILL", "VOTE"]);

type CoachState = {
  /** The note to show, or null. */
  shown: TryCoachStep | null;
  /** The strip keeps its height (round 1, while a note can still come) so the phone below never shifts. */
  open: boolean;
  dismiss: () => void;
};

export function useCoachMarks(raw: CoachStep | null, phase: string, round: number): CoachState {
  const [gone, setGone] = useState<ReadonlySet<TryCoachStep>>(() => new Set());
  const [prev, setPrev] = useState<TryCoachStep | null>(null);

  // "Get ready" already says what to do next; once the vote is cast the note says so.
  let step: TryCoachStep | null = raw;
  if (!step && round === 1) step = phase === "PROMPT" ? "type" : phase === "VOTE" ? "voted" : null;

  // A step that has been replaced was seen: never bring it back (adjusting state during render is React's pattern for this).
  if (step !== prev) {
    setPrev(step);
    if (prev && !gone.has(prev)) setGone(new Set(gone).add(prev));
  }

  const shown = step && !gone.has(step) ? step : null;
  const dismiss = () => {
    if (shown) setGone(new Set(gone).add(shown));
  };

  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGone((g) => new Set(g).add(shown));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown]);

  return { shown, open: Boolean(shown) || (round === 1 && GUIDED_PHASES.has(phase)), dismiss };
}

export function CoachStrip({ coach, className }: { coach: CoachState; className?: string }) {
  const { shown, open, dismiss } = coach;
  const copy = shown ? TRY_COPY.coach.steps[shown] : null;
  return (
    <div className={cn("mx-auto w-full max-w-[480px] shrink-0 px-3 transition-[height] duration-175 motion-reduce:transition-none lg:max-w-none lg:px-0", open ? "h-[86px]" : "h-0", className)}>
      <AnimatePresence initial={false}>
        {shown && copy ? (
          <m.div
            key={shown}
            role="status"
            data-testid="coach-mark"
            data-step={shown}
            initial={{ opacity: 0, y: 6, rotate: -1.6 }}
            animate={{ opacity: 1, y: 0, rotate: -0.6 }}
            exit={{ opacity: 0, transition: { duration: DURATION.fast, ease: EASE.exit } }}
            transition={{ duration: DURATION.medium, ease: EASE.arrive }}
            className="pt-3.5 pb-2.5"
          >
            <PaperCard className="flex items-center gap-1 rounded-element py-2 pr-0.5 pl-3 shadow-slip">
              <Tape className="-top-3.5 right-14 rotate-[4deg]" />
              {copy.n > 0 ? (
                <span aria-hidden="true" className="absolute -top-[16px] left-0">
                  <NumberBanner n={copy.n} label={TRY_COPY.coach.of} size="sm" seed={`coach-${shown}`} />
                </span>
              ) : null}
              <p className={cn("min-w-0 flex-1 text-fine leading-snug text-ink", copy.n > 0 && "pt-1")}>
                {copy.n > 0 ? <span className="sr-only">{TRY_COPY.coach.tip(copy.n)} </span> : null}
                <span className="font-display">{copy.title}.</span> <span className="text-ink-notes">{copy.body}</span>
              </p>
              <button
                type="button"
                onClick={dismiss}
                aria-label={TRY_COPY.coach.dismissLabel(copy.title)}
                className="press -my-1 inline-flex size-11 shrink-0 items-center justify-center rounded-blob text-ink-notes hover:text-ink"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </PaperCard>
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
