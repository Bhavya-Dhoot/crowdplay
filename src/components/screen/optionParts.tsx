"use client";
// Pieces shared by the vote board and the reveal: the stamps that mark an option, and the quiet-round pill.
import { m } from "@/components/ui/motion";
import { Stamp } from "@/components/ui/Stamp";
import { COPY } from "@/lib/copy";
import type { PublicOption } from "@/lib/realtime/types";
import { cn } from "@/components/ui/cn";
import { useStage } from "./stage";

/** WILDCARD (magenta) or NARRATOR'S PICK (ink) in a card's top-right corner; nothing for a crowd option. */
export function OptionStamp({ option, size = 32, delayMs = 0 }: { option: PublicOption; size?: number; delayMs?: number }) {
  const { px, compact } = useStage();
  if (compact || option.kind === "crowd") return null;
  const narrator = option.kind === "narrator";
  return (
    <Stamp
      kind={option.kind === "wildcard" ? "wildcard" : "narrator"}
      delayMs={delayMs}
      className="absolute top-[0.8em] right-[0.8em] z-20"
      style={{ ["--stamp-size" as string]: `${px(narrator ? Math.min(size, 26) : size)}px` }}
    />
  );
}

/** "Too quiet! The narrator improvises." when every option was written by the narrator. */
export function QuietPill() {
  const { compact } = useStage();
  return (
    <m.p
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      data-testid="screen-quiet"
      className={cn("rounded-pill border-[0.1em] border-light font-display font-extrabold text-on-stage", compact ? "px-[0.7em] py-[0.15em] text-[0.62em]" : "px-[1em] py-[0.3em] text-[1.35em]")}
    >
      {COPY.reveal.tooQuiet}
    </m.p>
  );
}
