// Swash: the yellow marker laid behind inline text (a title word, a number that matters, the toast keyword).
// Streaks, not a flat fill; slightly tilted with uneven ends. Server-safe, CSS only.
//   <Swash>writes the show.</Swash>              static, complete
//   <Swash play delayMs={300}>3 canon</Swash>     the marker swipes on left to right (410 ms); reduced motion: complete
// One line only (white-space: nowrap); pass className="whitespace-normal" if it must wrap, the swash then covers the box.
// Yellow means "the thread" (your idea, your vote, the winner, canon): do not use it as decoration.
import type { CSSProperties, ReactNode } from "react";
import { cn } from "./cn";

type Props = { children: ReactNode; play?: boolean; delayMs?: number; className?: string };

export function Swash({ children, play = false, delayMs = 0, className }: Props) {
  const style = delayMs ? ({ "--swash-delay": `${delayMs}ms` } as CSSProperties) : undefined;
  return (
    <span className={cn("swash", className)} data-play={play} style={style}>
      {children}
    </span>
  );
}
