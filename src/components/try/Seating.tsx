// Between "the button was pressed" and "the room exists": a taped note with a small pen drawing of a room (a screen and
// the seats filling up, drawn head by head), not a flash of the intro form. Server-safe: every stroke is a plain SVG path
// drawn on mount by the shared `.draw` pen animation; reduced motion shows the drawing complete.
import type { CSSProperties } from "react";
import { PaperCard } from "@/components/ui/PaperCard";
import { Tape } from "./Tape";
import { TRY_COPY } from "./tryCopy";

const HEADS_AT = [14, 31, 48, 65, 82, 22, 39, 56, 73, 90] as const;

function pen(delay: number, ms = 260): CSSProperties {
  return { "--draw-ms": `${ms}ms`, "--draw-delay": `${delay}ms` } as CSSProperties;
}

function RoomDoodle() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 104 72"
      className="h-[72px] w-[104px] shrink-0 overflow-visible"
      fill="none"
      stroke="var(--ink)"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="22" y="3" width="60" height="26" rx="4" fill="var(--paper-raised)" pathLength="1" className="draw" data-play style={pen(0, 420)} />
      <path d="M32 12h28M32 20h16" pathLength="1" className="draw" data-play style={pen(420, 240)} />
      {HEADS_AT.map((x, i) => {
        const y = i < 5 ? 45 : 61;
        const delay = 700 + i * 170;
        return (
          <g key={x + y}>
            <circle cx={x} cy={y} r="4.6" pathLength="1" className="draw" data-play style={pen(delay, 200)} />
            <path d={`M${x - 7} ${y + 10}q7-9 14 0`} pathLength="1" className="draw" data-play style={pen(delay + 140, 160)} />
          </g>
        );
      })}
    </svg>
  );
}

export function Seating() {
  return (
    <section aria-live="polite" className="mx-auto w-full max-w-md px-4 pt-10 md:pt-16">
      <PaperCard tilt={-0.8} className="relative flex items-center gap-5 p-5">
        <Tape className="-top-3 left-8 -rotate-[5deg]" />
        <RoomDoodle />
        <div className="min-w-0">
          <h1 className="text-h3 leading-tight text-ink">{TRY_COPY.stageTitle}</h1>
          <p className="mt-1 text-small text-ink-notes">{TRY_COPY.stageBody}</p>
        </div>
      </PaperCard>
    </section>
  );
}
