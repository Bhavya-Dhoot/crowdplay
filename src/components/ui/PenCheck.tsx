// PenCheck: a check mark drawn by pen (220 ms). Success in this design is a drawn ink check, never a green tick.
// Server-safe. Draws on mount; the seed makes the stroke the same on the server and in the browser.
//   <PenCheck />                         24 px, draws on mount (pair with haptic("tap") when it confirms a send)
//   <PenCheck size={32} delayMs={120} seed={idea.id} />
//   <PenCheck play={false} />            static, complete
// Colour is currentColor (ink by default). Decorative unless you pass `label`.
import type { CSSProperties } from "react";
import { cn } from "./cn";
import { checkPath } from "./doodle";
import { DRAW_MS } from "./motionTokens";

type Props = { size?: number; play?: boolean; delayMs?: number; seed?: string | number; label?: string; className?: string };

export function PenCheck({ size = 24, play = true, delayMs = 0, seed = "check", label, className }: Props) {
  const style = { "--draw-ms": `${DRAW_MS.check}ms`, "--draw-delay": `${delayMs}ms` } as CSSProperties;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("shrink-0 overflow-visible", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={checkPath(seed)} pathLength="1" className="draw" data-play={play} style={style} />
    </svg>
  );
}
