"use client";
// DISTILL dock: "Reading 142 ideas…" with a light sweeping over the words, a rotating line and three
// bobbing chips (A, B, wildcard) hinting at what is being built. It takes the composer's slot, same height.
import { Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/components/ui/cn";
import { DISTILL_LINES } from "@/lib/copy";
import { pickLine } from "./logic";
import { PLAY_COPY } from "./playCopy";
import styles from "./play.module.css";

const LINE_MS = 2200;

export function DistillStatus({ ideas }: { ideas: number }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), LINE_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div data-testid="distill-status" className="flex h-[132px] flex-col items-center justify-center gap-2 rounded-card border border-line bg-surface-2 px-4 text-center">
      <div aria-hidden="true" className="flex items-center gap-2">
        {(["A", "B", "C"] as const).map((l, i) => (
          <span
            key={l}
            className={cn(
              "grid size-7 place-items-center rounded-full text-xs font-bold text-ink",
              l === "A" ? "bg-opt-a" : l === "B" ? "bg-opt-b" : "bg-opt-c",
              styles.bob,
            )}
            style={{ ["--d" as string]: `${i * 0.18}s` }}
          >
            {l === "C" ? <Zap className="size-3.5" strokeWidth={3} /> : l}
          </span>
        ))}
      </div>
      <p className={cn("font-display text-xl leading-tight font-bold", styles.shimmerText)}>
        {ideas > 0 ? PLAY_COPY.play.distill.reading(ideas) : PLAY_COPY.play.distill.quiet}
      </p>
      <p aria-hidden="true" className="h-5 text-sm text-muted">
        {pickLine(DISTILL_LINES, tick)}
      </p>
    </div>
  );
}
