// ProgressBar: live bar for votes, loading and timers. Server-safe.
//   <ProgressBar value={0.42} tone="a" label="Option A, 42 percent" />    value is 0..1
// `label` is required: a bar without a name is invisible to screen readers.
import { cn } from "./cn";

export type BarTone = "accent" | "a" | "b" | "c" | "ok" | "warn" | "danger" | "wild";

const FILL: Record<BarTone, string> = {
  accent: "bg-accent",
  a: "bg-opt-a",
  b: "bg-opt-b",
  c: "bg-opt-c",
  wild: "bg-wild",
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
      className={cn("h-3 w-full overflow-hidden rounded-pill bg-surface-2", className)}
    >
      <div
        className={cn("h-full rounded-pill transition-[width] duration-[250ms] ease-out motion-reduce:transition-none", FILL[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
