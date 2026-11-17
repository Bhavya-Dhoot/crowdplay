// Stamp: a rotated rubber-stamp label. Server-safe: the arrival spring is a CSS animation with a spring `linear()`
// easing computed from the spring tokens (stiffness 420, damping 22), so no animation library is shipped for it.
//   <Stamp kind="canon|wildcard|narrator" size="sm|md|lg|xl" animate delayMs className />
//   canon = gold "CANON" (ink text), wildcard = magenta "WILDCARD", narrator = ink "NARRATOR'S PICK".
// animate (default true) plays once when the element mounts: scale 1.35 -> 1, rotate -8 -> -4 degrees with overshoot.
// Pass animate={false} for a static stamp (lists that should not replay, the landing's static frame). Under
// prefers-reduced-motion it only fades (175 ms) and keeps its -4 degree pose. Position it yourself (absolute over a
// card corner); it never changes layout. Use haptic("canon") from motionTokens next to the canon moment.
import type { CSSProperties } from "react";
import { COPY } from "@/lib/copy";
import { cn } from "./cn";
import { SPRING, springToLinear } from "./motionTokens";

export type StampKind = "canon" | "wildcard" | "narrator";
export type StampSize = "sm" | "md" | "lg" | "xl";

const LABEL: Record<StampKind, string> = {
  canon: "Canon",
  wildcard: "Wildcard",
  narrator: COPY.reveal.narratorPick,
};

const KIND_CLASS: Record<StampKind, string> = { canon: "", wildcard: "stamp-wildcard", narrator: "stamp-narrator" };

// One easing for every stamp; computed once at module load.
const SPRING_CSS = springToLinear(SPRING.stamp.stiffness, SPRING.stamp.damping);

type Props = {
  kind?: StampKind;
  size?: StampSize;
  animate?: boolean;
  delayMs?: number;
  className?: string;
  style?: CSSProperties;
};

export function Stamp({ kind = "canon", size = "md", animate = true, delayMs = 0, className, style }: Props) {
  const s = {
    "--stamp-ease": SPRING_CSS.easing,
    "--stamp-ms": `${SPRING_CSS.durationMs}ms`,
    "--stamp-delay": `${delayMs}ms`,
    ...style,
  } as CSSProperties;
  return (
    <span data-animate={animate} className={cn("stamp", KIND_CLASS[kind], `stamp-${size}`, className)} style={animate ? s : style}>
      {LABEL[kind]}
    </span>
  );
}
