"use client";
// The three guided coach marks of Judge Mode. PlayerView calls its `coach` slot with the current step
// ("type" -> "watch" -> "vote") and floats the result above the composer; this component decides whether to
// show it. Each mark shows once: when the step moves on (or the judge dismisses it) it does not come back in
// the next round. The mark floats over the bottom of the body, so only its dismiss button takes clicks: a vote or
// a tap on the card underneath always gets through.
import { Lightbulb, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { CoachStep } from "@/components/play/PlayerView";
import { m, AnimatePresence } from "@/components/ui/motion";
import { TRY_COPY } from "./tryCopy";

export function CoachSlot({ step }: { step: CoachStep | null }) {
  const [gone, setGone] = useState<ReadonlySet<CoachStep>>(() => new Set());
  const [prev, setPrev] = useState<CoachStep | null>(null);

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

  const copy = shown ? TRY_COPY.coach.steps[shown] : null;
  return (
    <AnimatePresence>
      {shown && copy ? (
        <m.div
          key={shown}
          role="status"
          data-testid="coach-mark"
          data-step={shown}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6, transition: { duration: 0.12 } }}
          transition={{ duration: 0.22 }}
          className="pointer-events-none glow-accent relative flex items-center gap-2.5 rounded-card bg-surface-2 py-1.5 pr-1 pl-3 shadow-lg shadow-black/50"
        >
          <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-ink">
            <Lightbulb className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-baseline gap-2">
              <span className="text-[11px] font-semibold tracking-wide whitespace-nowrap text-accent uppercase">{TRY_COPY.coach.count(copy.n)}</span>
              <span className="font-display text-[15px] leading-tight font-bold">{copy.title}</span>
            </p>
            <p className="text-[12.5px] leading-snug text-muted">{copy.body}</p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label={TRY_COPY.coach.dismissLabel(copy.title)}
            className="pointer-events-auto inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-text motion-reduce:transition-none"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
