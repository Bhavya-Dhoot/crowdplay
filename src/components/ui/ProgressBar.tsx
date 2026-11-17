// ProgressBar: live bar for votes, loading and timers. Server-safe.
//   <ProgressBar value={0.42} tone="a" label="Option A, 42 percent" />    value is 0..1
// `label` is required: a bar without a name is invisible to screen readers. Tones: accent (gold), light (this round's
// stage light), a/b/c (gels), wild, ok, warn, danger. The fill animates width at 175 ms; for hot paths (a vote bar that
// updates often) prefer a transform: scaleX wrapper of your own, width is layout.
import { cn } from "./cn";

export type BarTone = "accent" | "light" | "a" | "b" | "c" | "ok" | "warn" | "danger" | "wild";

const FILL: Record<BarTone, string> = {
  accent: "bg-gold",
  light: "bg-light",
  a: "bg-gel-a",
  b: "bg-gel-b",
  c: "bg-gel-c",
  wild: "bg-gel-c",
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
};

type Props = { value: number; label: string; tone?: BarTone; className?: string };

export function ProgressBar({ value, label, tone = "accent", className }: Props) {
  const v = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  const pct = Math.round(v * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn("h-3 w-full overflow-hidden rounded-pill bg-stage-2", className)}
    >
      <div
        className={cn("h-full rounded-pill transition-[width] duration-175 ease-arrive motion-reduce:transition-none", FILL[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
