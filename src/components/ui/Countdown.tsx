"use client";
// Countdown: a hand-drawn circle whose ink arc is the time that is left (it draws down), with the number in Kalam, driven by
// a SERVER timestamp (phaseEndsAt) and the clock offset from useRoom, so every phone ends at the same moment. In the last
// 5 s the number gets a yellow swash: yellow = something you should act on now. No beat, no strobe.
//   <Countdown endsAt={state.phaseEndsAt} startedAt={state.phaseStartedAt} offsetMs={offsetMs}
//              paused={state.paused} size={64} labelled />
//   labelled      also prints "12 seconds left" next to the ring (the screen overlay uses this)
//   Screen readers get the same sentence in hidden text; the element is a role="timer" with
//   aria-live off, so it never chatters. Renders an empty ring of the same size when there is
//   nothing to count, so layout never jumps between phases.
// <Ring fraction size stroke color track/> is exported for other ring uses (e.g. the 2 s send cooldown).
import { Pause } from "lucide-react";
import { useCountdown } from "@/lib/client/useCountdown";
import { cn } from "./cn";
import { ringPath } from "./doodle";
import { Swash } from "./Swash";

export function Ring({
  fraction,
  size = 64,
  stroke = 4,
  color = "var(--ink)",
  track = "var(--marker-2)",
  className,
}: {
  fraction: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  className?: string;
}) {
  const f = Math.min(1, Math.max(0, fraction));
  const d = ringPath(size, stroke, `ring-${size}`);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className={className} fill="none" strokeLinecap="round">
      <path d={d} stroke={track} strokeWidth={stroke} />
      <path className="ring-fill" d={d} stroke={color} strokeWidth={stroke} pathLength="1" strokeDasharray="1" strokeDashoffset={1 - f} />
    </svg>
  );
}

type Props = {
  endsAt: number | null;
  startedAt?: number | null;
  offsetMs?: number;
  paused?: boolean;
  size?: number;
  labelled?: boolean;
  className?: string;
};

export function Countdown({ endsAt, startedAt = null, offsetMs = 0, paused = false, size = 64, labelled = false, className }: Props) {
  const c = useCountdown({ endsAt, startedAt, offsetMs, paused });
  const alarm = !c.paused && (c.warn || c.done);
  const ink = c.paused ? "var(--ink-notes)" : "var(--ink)";
  const stroke = Math.max(3, Math.round(size / 18));
  const text = c.paused
    ? "Paused"
    : c.seconds === null
      ? ""
      : c.done
        ? "Time's up"
        : `${c.seconds} ${c.seconds === 1 ? "second" : "seconds"} left`;
  const number = c.paused ? <Pause style={{ width: size * 0.34, height: size * 0.34 }} /> : c.seconds === null ? "" : c.seconds;
  return (
    <div className={cn("inline-flex items-center gap-3", className)}>
      <div
        role="timer"
        aria-live="off"
        className="countdown relative inline-grid shrink-0 place-items-center"
        data-warn={c.warn}
        style={{ width: size, height: size }}
      >
        <Ring fraction={c.fraction} size={size} stroke={stroke} color={ink} className="absolute inset-0" />
        <span
          aria-hidden="true"
          className="absolute inset-0 grid place-items-center font-display tabular-nums leading-none"
          style={{ fontSize: Math.round(size * 0.4), color: ink }}
        >
          {alarm && c.seconds !== null ? <Swash play>{number}</Swash> : number}
        </span>
        <span className="sr-only">{text}</span>
      </div>
      {labelled && text ? (
        <span aria-hidden="true" className="font-display text-lead" style={{ color: ink }}>
          {text}
        </span>
      ) : null}
    </div>
  );
}
