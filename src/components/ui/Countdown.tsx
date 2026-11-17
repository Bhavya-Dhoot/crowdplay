"use client";
// Countdown: a thin ring in this round's stage light (--light) with the number in Bricolage tabular figures, driven by a
// SERVER timestamp (phaseEndsAt) and the clock offset from useRoom, so every phone ends at the same moment. The last 5 s
// turn --warn and the ring gives one beat per displayed second (a pulse, not a strobe; none under reduced motion).
//   <Countdown endsAt={state.phaseEndsAt} startedAt={state.phaseStartedAt} offsetMs={offsetMs}
//              paused={state.paused} size={64} labelled />
//   labelled      also prints "12 seconds left" next to the ring (the screen overlay uses this)
//   Screen readers get the same sentence in hidden text; the element is a role="timer" with
//   aria-live off, so it never chatters. Renders an empty ring of the same size when there is
//   nothing to count, so layout never jumps between phases.
//   Round 1's light is amber, the same hue as --warn: the beat and the heavier stroke are what tell warn apart there.
// <Ring fraction size stroke color track/> is exported for other ring uses (e.g. the 2 s send cooldown).
import { Pause } from "lucide-react";
import { useCountdown } from "@/lib/client/useCountdown";
import { cn } from "./cn";

export function Ring({
  fraction,
  size = 64,
  stroke = 4,
  color = "var(--light)",
  track = "var(--stage-2)",
  className,
}: {
  fraction: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const f = Math.min(1, Math.max(0, fraction));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className={cn("-rotate-90", className)}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
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
  const alarm = !c.paused && (c.warn || c.done);
  const ring = c.paused ? "var(--muted-on-stage)" : alarm ? "var(--warn)" : "var(--light)";
  const ink = c.paused ? "var(--muted-on-stage)" : alarm ? "var(--warn)" : "var(--ink-on-stage)";
  const stroke = Math.max(3, Math.round(size / 20)) + (alarm ? 1 : 0);
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
        {/* Re-keyed every second while warning, so the beat restarts exactly once per displayed second. */}
        <div key={c.warn ? c.seconds : "calm"} className="countdown-beat absolute inset-0 grid place-items-center">
          <Ring fraction={c.fraction} size={size} stroke={stroke} color={ring} />
          <span
            aria-hidden="true"
            className="absolute inset-0 grid place-items-center font-display font-extrabold tabular-nums leading-none"
            style={{ fontSize: Math.round(size * 0.38), color: ink }}
          >
            {c.paused ? <Pause style={{ width: size * 0.34, height: size * 0.34 }} /> : c.seconds === null ? "" : c.seconds}
          </span>
        </div>
        <span className="sr-only">{text}</span>
      </div>
      {labelled && text ? (
        <span aria-hidden="true" className="font-display text-lead font-bold" style={{ color: ink }}>
          {text}
        </span>
      ) : null}
    </div>
  );
}
