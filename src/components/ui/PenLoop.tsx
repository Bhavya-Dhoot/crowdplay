"use client";
// PenLoop: a hand-drawn ellipse drawn around its child, the way a pen circles the thing that matters (your vote, the
// winner). The outline is measured from the child, so the stroke keeps a uniform width at any size, and its shape comes
// from a seed (same seed, same loop). It draws on mount (700 ms) and overshoots where it started. Small things (a letter,
// a word) get an ellipse; card-sized things get a rounded-rectangle loop, so the corners stay inside the pen line.
//   <PenLoop seed={option.id}><LetterBadge letter="A" /></PenLoop>
//   <PenLoop tone="yellow" boil className="block">...the winning card...</PenLoop>   the canon loop
//   <PenLoop play={false}>...</PenLoop>                                                static, complete
// tone: ink (default) | yellow (--hl-deep, the canon loop). shape: auto (default) | ellipse | round. boil = the optional ink
// wobble (REVEAL only). The pen reaches up to 28 px beyond the child: leave that much room around it.
// Nothing is drawn on the server or before the first measure; under reduced motion the loop appears complete.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "./cn";
import { loopPath, roundLoopPath } from "./doodle";
import { DRAW_MS } from "./motionTokens";

type Props = {
  children: ReactNode;
  play?: boolean;
  delayMs?: number;
  seed?: string | number;
  tone?: "ink" | "yellow";
  shape?: "auto" | "ellipse" | "round";
  strokeWidth?: number;
  boil?: boolean;
  className?: string;
};

export function PenLoop({ children, play = true, delayMs = 0, seed = "loop", tone = "ink", shape = "auto", strokeWidth = 3, boil = false, className }: Props) {
  const box = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const w = Math.round(el.offsetWidth);
      const h = Math.round(el.offsetHeight);
      setSize((s) => (s && s.w === w && s.h === h ? s : { w, h }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const round = shape === "round" || (shape === "auto" && !!size && size.w >= 140 && size.h >= 56);
  const reachX = !size ? 0 : round ? 14 : Math.min(28, Math.max(10, Math.round(size.w * 0.18)));
  const reachY = !size ? 0 : round ? 14 : Math.min(22, Math.max(8, Math.round(size.h * 0.28)));
  const W = size ? size.w + reachX * 2 : 0;
  const H = size ? size.h + reachY * 2 : 0;
  const style = { "--draw-ms": `${DRAW_MS.loop}ms`, "--draw-delay": `${delayMs}ms` } as CSSProperties;

  return (
    // The loop is drawn first, so a positioned child (a card, the CANON ribbon pinned to it) paints over its line.
    <span ref={box} className={cn("pen-wrap", className)}>
      {size && size.w > 0 && size.h > 0 ? (
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          className={cn("pointer-events-none absolute max-w-none overflow-visible", boil && "ink-boil")}
          style={{ left: -reachX, top: -reachY }}
          fill="none"
          stroke={tone === "yellow" ? "var(--hl-deep)" : "var(--ink)"}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={(round ? roundLoopPath : loopPath)(W, H, seed, strokeWidth + 2)} pathLength="1" className="draw" data-play={play} style={style} />
        </svg>
      ) : null}
      {children}
    </span>
  );
}
