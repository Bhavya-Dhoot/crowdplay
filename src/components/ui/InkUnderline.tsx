// InkUnderline: a wavy fineliner underline drawn under inline text. Server-safe, drawn on mount (400 ms).
//   <InkUnderline>Host a show</InkUnderline>
//   <InkUnderline play={false} seed="host">Host a show</InkUnderline>     static, complete
// The line sits just under the baseline and never changes the text's layout.
import type { CSSProperties, ReactNode } from "react";
import { cn } from "./cn";
import { underlinePath } from "./doodle";
import { DRAW_MS } from "./motionTokens";

type Props = { children: ReactNode; play?: boolean; delayMs?: number; seed?: string | number; className?: string };

export function InkUnderline({ children, play = true, delayMs = 0, seed = "underline", className }: Props) {
  const style = { "--draw-ms": `${DRAW_MS.outline}ms`, "--draw-delay": `${delayMs}ms` } as CSSProperties;
  return (
    <span className={cn("pen-wrap", className)}>
      {children}
      <svg
        aria-hidden="true"
        viewBox="0 0 100 10"
        preserveAspectRatio="none"
        className="pointer-events-none absolute -bottom-[0.2em] left-[-2%] h-[0.34em] w-[104%] overflow-visible"
        fill="none"
        stroke="var(--ink)"
        strokeWidth={2.5}
        strokeLinecap="round"
      >
        <path d={underlinePath(100, 10, seed)} pathLength="1" className="draw" data-play={play} style={style} />
      </svg>
    </span>
  );
}
