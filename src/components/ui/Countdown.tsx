"use client";
// Countdown: circular ring + number, driven by a SERVER timestamp (phaseEndsAt) and the clock
// offset from useRoom, so every phone ends at the same moment. Turns --warn in the last 5 s.
//   <Countdown endsAt={state.phaseEndsAt} startedAt={state.phaseStartedAt} offsetMs={offsetMs}
//              paused={state.paused} size={64} labelled />
//   labelled      also prints "12 seconds left" next to the ring (the screen overlay uses this)
//   Screen readers get the same sentence in hidden text; the element is a role="timer" with
//   aria-live off, so it never chatters. Renders an empty ring of the same size when there is
//   nothing to count, so layout never jumps between phases.
// <Ring fraction size stroke color/> is exported for other ring uses (e.g. the 2 s send cooldown).
import { Pause } from "lucide-react";
import { useCountdown } from "@/lib/client/useCountdown";
import { cn } from "./cn";

export function Ring({
  fraction,
  size = 64,
  stroke = 6,
  color = "var(--accent)",
  className,
}: {
  fraction: number;
  size?: number;
  stroke?: number;
  color?: string;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const f = Math.min(1, Math.max(0, fraction));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className={cn("-rotate-90", className)}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
      <circle
        className="ring-fill"
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - f)}
      />
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
  const color = c.paused ? "var(--muted)" : c.warn || c.done ? "var(--warn)" : "var(--accent)";
  const text = c.paused
    ? "Paused"
    : c.seconds === null
      ? ""
      : c.done
        ? "Time's up"
        : `${c.seconds} ${c.seconds === 1 ? "second" : "seconds"} left`;
  return (
    <div className={cn("inline-flex items-center gap-3", className)}>
      <div
        role="timer"
        aria-live="off"
        className="countdown relative inline-grid shrink-0 place-items-center"
        data-warn={c.warn}
        style={{ width: size, height: size }}
      >
        <Ring fraction={c.fraction} size={size} stroke={Math.max(4, Math.round(size / 11))} color={color} />
        <span
          aria-hidden="true"
          className="countdown-num absolute inset-0 grid place-items-center font-display font-extrabold tabular-nums leading-none"
          style={{ fontSize: Math.round(size * 0.36), color }}
        >
          {c.paused ? <Pause style={{ width: size * 0.34, height: size * 0.34 }} /> : c.seconds === null ? "" : c.seconds}
        </span>
        <span className="sr-only">{text}</span>
      </div>
      {labelled && text ? (
        <span aria-hidden="true" className="font-display text-xl font-bold" style={{ color }}>
          {text}
        </span>
      ) : null}
    </div>
  );
}
