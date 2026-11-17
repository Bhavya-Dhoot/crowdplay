// LetterBadge: an option's letter in a hand-drawn ink blob on paper. Server-safe.
//   <LetterBadge letter="A|B|C" size={40} />                        C is the wildcard and shows the bolt doodle (the letter stays in the accessible text)
//   <LetterBadge letter="B" size={44} selected />                   YOUR vote: the yellow marker fills it (410 ms) and the pen circles it
//   <LetterBadge letter="A" selected animate={false} />             selected, already drawn (lists that should not replay)
// The letter is real text (A, B or "C" for screen readers), so colour is never the only signal. Ink on paper, or ink on yellow
// when selected (AA). Reduced motion: the fill and the circle appear complete.
import { Zap } from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "./cn";
import { loopPath } from "./doodle";
import { DRAW_MS } from "./motionTokens";
import type { Gel } from "./PaperCard";

export type OptionLetter = "A" | "B" | "C";

type Props = { letter: OptionLetter; size?: number; selected?: boolean; animate?: boolean; className?: string };

export function LetterBadge({ letter, size = 40, selected = false, animate = true, className }: Props) {
  const ring = Math.round(size * 1.32);
  const style: CSSProperties = { width: size, height: size, fontSize: Math.round(size * 0.5) };
  const drawStyle = { "--draw-ms": `${DRAW_MS.loop}ms`, "--draw-delay": `${DRAW_MS.swipe - 120}ms` } as CSSProperties;
  return (
    <span className={cn("letter-badge", className)} style={style} data-play={selected && animate} data-selected={selected || undefined}>
      {selected ? <span aria-hidden="true" className="letter-fill" /> : null}
      <span className="letter-glyph">
        {letter === "C" ? (
          <>
            <Zap aria-hidden="true" fill="currentColor" style={{ width: size * 0.5, height: size * 0.5 }} />
            <span className="sr-only">C</span>
          </>
        ) : (
          letter
        )}
      </span>
      {selected ? (
        <svg aria-hidden="true" viewBox={`0 0 ${ring} ${ring}`} className="letter-ring" strokeWidth={Math.max(2.5, size * 0.065)}>
          <path d={loopPath(ring, ring, `letter-${letter}`, 3)} pathLength="1" className="draw" data-play={animate} style={drawStyle} />
        </svg>
      ) : null}
    </span>
  );
}

/** "a" | "b" | "c" for PaperCard's gel prop from the letter. */
export const gelOf = (letter: OptionLetter): Gel => letter.toLowerCase() as Gel;
