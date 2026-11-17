"use client";
// Pieces shared by the vote board and the reveal: the ribbon that marks a non-crowd option, and the quiet-round slip.
import { cn } from "@/components/ui/cn";
import { Ribbon } from "@/components/ui/Ribbon";
import { COPY } from "@/lib/copy";
import type { PublicOption } from "@/lib/realtime/types";
import { bannerStyle, tiltStyle, useStage } from "./stage";

/** WILDCARD (dashed) or NARRATOR'S PICK on a box's top edge; nothing for a crowd option. Neither is yellow: yellow is the winner's. */
export function OptionRibbon({ option, sizePx = 26 }: { option: PublicOption; sizePx?: number }) {
  const { px, compact } = useStage();
  if (compact || option.kind === "crowd") return null;
  return (
    <div className="absolute z-10" style={{ right: px(8), top: px(-sizePx * 0.5) }}>
      <Ribbon kind={option.kind === "wildcard" ? "wildcard" : "narrator"} animate={false} style={bannerStyle(px(sizePx))} />
    </div>
  );
}

/** "Too quiet! The narrator improvises." when every option was written by the narrator. */
export function QuietPill() {
  const { compact } = useStage();
  return (
    <p
      data-testid="screen-quiet"
      style={tiltStyle(0.6)}
      className={cn("cps-slip cps-tape placed leading-none", compact ? "px-[0.7em] py-[0.25em] text-[0.7em]" : "px-[1em] py-[0.4em] text-[1.3em]")}
    >
      {COPY.reveal.tooQuiet}
    </p>
  );
}
