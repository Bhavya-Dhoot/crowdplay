// The three little drawings in the landing page's step strip (type -> vote -> canon). Server-safe: every stroke is a
// plain SVG path drawn on load with the shared `.draw` pen animation (staggered by `delayMs`); reduced motion shows
// them complete. Ink and grey marker only, except the closing loop around the canon note (yellow = canon).
import type { CSSProperties, SVGProps } from "react";
import { loopPath } from "@/components/ui/doodle";

type Step = 0 | 1 | 2;

const STROKE: SVGProps<SVGSVGElement> = {
  fill: "none",
  stroke: "var(--ink)",
  strokeWidth: 2.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function pen(delay: number, ms = 260): CSSProperties {
  return { "--draw-ms": `${ms}ms`, "--draw-delay": `${delay}ms` } as CSSProperties;
}

// A stroke that draws itself: one path, pathLength 1.
function P({ d, delay, ms, ...rest }: { d: string; delay: number; ms?: number } & SVGProps<SVGPathElement>) {
  return <path d={d} pathLength="1" className="draw" data-play style={pen(delay, ms)} {...rest} />;
}
function R({ delay, ms, ...rest }: { delay: number; ms?: number } & SVGProps<SVGRectElement>) {
  return <rect pathLength="1" className="draw" data-play style={pen(delay, ms)} {...rest} />;
}

function Type({ t }: { t: number }) {
  return (
    <>
      <R delay={t} x="32" y="3" width="32" height="58" rx="7" fill="var(--paper-raised)" />
      <P delay={t + 200} d="M39 17h18" />
      <P delay={t + 280} d="M39 25h12" />
      <P delay={t + 360} d="M39 41c2-3 4 3 6 0s4 3 6 0 3 2 4 0" />
      <P delay={t + 440} d="M44 54h8" />
      <R delay={t + 120} x="4" y="9" width="22" height="16" rx="3" transform="rotate(-9 15 17)" fill="var(--paper-raised)" />
      <P delay={t + 480} d="M9 17h12" transform="rotate(-9 15 17)" />
      <R delay={t + 200} x="70" y="10" width="22" height="16" rx="3" transform="rotate(8 81 18)" fill="var(--paper-raised)" />
      <P delay={t + 520} d="M75 18h12" transform="rotate(8 81 18)" />
      <R delay={t + 300} x="3" y="38" width="20" height="14" rx="3" transform="rotate(6 13 45)" fill="var(--paper-raised)" />
      <P delay={t + 560} d="M8 45h10" transform="rotate(6 13 45)" />
    </>
  );
}

function Vote({ t }: { t: number }) {
  const label: CSSProperties = { fontFamily: "var(--f-display)", fontWeight: 700 };
  const cols = [
    { x: 4, letter: "A", bar: 16 },
    { x: 36, letter: "B", bar: 8 },
    { x: 68, letter: "C", bar: 11 },
  ];
  return (
    <>
      {cols.map((c, i) => (
        <g key={c.letter}>
          <R delay={t + i * 140} x={c.x} y="3" width="24" height="30" rx="5" fill="var(--paper-raised)" />
          <text x={c.x + 12} y="25" textAnchor="middle" fontSize="19" fill="var(--ink)" stroke="none" style={label}>
            {c.letter}
          </text>
          <R delay={t + 300 + i * 140} x={c.x + 2} y={61 - c.bar} width="20" height={c.bar} rx="2" fill="var(--marker-3)" />
        </g>
      ))}
    </>
  );
}

function Canon({ t }: { t: number }) {
  return (
    <>
      <R delay={t} x="16" y="14" width="64" height="36" rx="6" fill="var(--paper-raised)" />
      <P delay={t + 220} d="M25 27h34" />
      <P delay={t + 300} d="M25 37h22" />
      <P delay={t + 380} d="M67 22l1.6 3.4 3.7.5-2.7 2.6.7 3.7-3.3-1.8-3.3 1.8.7-3.7-2.7-2.6 3.7-.5z" strokeWidth={1.8} />
      <P delay={t + 460} ms={520} d={loopPath(96, 64, "landing-canon", 3)} stroke="var(--hl-deep)" strokeWidth={3} />
      <P delay={t + 800} d="M90 6l3-4M93 14l5-1M4 56l-3 3M8 61l-1 3" strokeWidth={2} ms={200} />
    </>
  );
}

/** One step's drawing. `delayMs` is when the pen starts (the banner above it has just been drawn). */
export function StepDoodle({ step, delayMs = 0 }: { step: Step; delayMs?: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 96 64" className="h-[80px] w-[120px] overflow-visible" {...STROKE}>
      {step === 0 ? <Type t={delayMs} /> : step === 1 ? <Vote t={delayMs} /> : <Canon t={delayMs} />}
    </svg>
  );
}
