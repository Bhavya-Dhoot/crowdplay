// ProgressBar: a hand-drawn bar that fills with grey marker (votes, loading, timers). Server-safe.
//   <ProgressBar value={0.42} tone="a" label="Option A, 42 percent" />    value is 0..1
// `label` is required: a bar without a name is invisible to screen readers. Tones: accent / warn = the yellow marker (the
// winner, YOUR vote: the thread), danger = --danger, everything else (a, b, c, wild, light, ok) = grey marker. The fill
// animates width at 175 ms; for hot paths (a vote bar that updates often) prefer a transform: scaleX wrapper of your own,
// width is layout.
import { cn } from "./cn";

type BarTone = "accent" | "light" | "a" | "b" | "c" | "ok" | "warn" | "danger" | "wild";

const FILL: Record<BarTone, string> = {
  accent: "bar-fill-yellow",
  light: "bar-fill-grey",
  a: "bar-fill-grey",
  b: "bar-fill-grey",
  c: "bar-fill-grey",
  wild: "bar-fill-grey",
  ok: "bar-fill-grey",
  warn: "bar-fill-yellow",
  danger: "bar-fill-danger",
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
      className={cn("h-4 w-full overflow-hidden rounded-pill border-2 border-ink bg-paper-raised", className)}
    >
      <div
        className={cn("h-full rounded-pill transition-[width] duration-175 ease-arrive motion-reduce:transition-none", FILL[tone], pct > 0 && "border-r-2 border-ink")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
