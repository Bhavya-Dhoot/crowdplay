"use client";
// DISTILL dock: "Reading 142 ideas…" with a light sweeping over the words, a rotating line and three bobbing gel
// discs (A, B, wildcard) hinting at what is being built. It takes the composer's slot, same height.
import { useEffect, useState } from "react";
import { GelDisc, type OptionLetter } from "@/components/ui/GelDisc";
import { cn } from "@/components/ui/cn";
import { DISTILL_LINES } from "@/lib/copy";
import { pickLine } from "./logic";
import { PLAY_COPY } from "./playCopy";
import styles from "./play.module.css";

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
      <div aria-hidden="true" className="flex items-center gap-2">
        {LETTERS.map((l, i) => (
          <span key={l} className={styles.bob} style={{ ["--d" as string]: `${i * 0.18}s` }}>
            <GelDisc letter={l} size={28} />
          </span>
        ))}
      </div>
      <p className={cn("font-display text-lead leading-tight font-bold", styles.shimmerText)}>
        {ideas > 0 ? PLAY_COPY.play.distill.reading(ideas) : PLAY_COPY.play.distill.quiet}
      </p>
      <p aria-hidden="true" className="h-5 text-small text-muted-on-stage">
        {pickLine(DISTILL_LINES, tick)}
      </p>
    </div>
  );
}
