"use client";
// DISTILL dock: "Reading 142 ideas…" with three lettered boxes (A, B, wildcard) placed one after another to hint at what
// is being built, and a line that is re-written every couple of seconds. Nothing loops: life comes from the new line. It
// takes the composer's slot, same height.
import { useEffect, useState } from "react";
import { LetterBadge, type OptionLetter } from "@/components/ui/LetterBadge";
import { DISTILL_LINES } from "@/lib/copy";
import { pickLine } from "./logic";
import { PLAY_COPY } from "./playCopy";

const LINE_MS = 2200;
const LETTERS: OptionLetter[] = ["A", "B", "C"];

export function DistillStatus({ ideas }: { ideas: number }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), LINE_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div data-testid="distill-status" className="flex min-h-[100px] flex-col items-center justify-center gap-1.5 px-4 text-center">
      <div aria-hidden="true" className="flex items-center gap-3">
        {LETTERS.map((l, i) => (
          <span key={l} className="placed" style={{ ["--placed-delay" as string]: `${i * 140}ms` }}>
            <LetterBadge letter={l} size={30} />
          </span>
        ))}
      </div>
      <p className="font-display text-lead leading-tight">{ideas > 0 ? PLAY_COPY.play.distill.reading(ideas) : PLAY_COPY.play.distill.quiet}</p>
      <p key={tick % DISTILL_LINES.length} aria-hidden="true" className="placed h-6 text-body text-ink-notes">
        {pickLine(DISTILL_LINES, tick)}
      </p>
    </div>
  );
}
