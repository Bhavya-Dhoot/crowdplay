// Pill: small rounded label. Server-safe.
//   <Pill tone="neutral|accent|ok|warn|danger|wild|a|b|c|outline" size="sm|md">text or icon + text</Pill>
// Tones a/b/c are the option colours: always put the letter (A/B/C) or an icon inside, never colour alone.
import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export type PillTone = "neutral" | "accent" | "ok" | "warn" | "danger" | "wild" | "a" | "b" | "c" | "outline";

const TONE: Record<PillTone, string> = {
  neutral: "border border-line bg-surface-2 text-muted",
  accent: "bg-accent text-ink",
  ok: "bg-ok text-ink",
  warn: "bg-warn text-ink",
  danger: "bg-danger text-ink",
  wild: "bg-wild text-ink",
  a: "bg-opt-a text-ink",
  b: "bg-opt-b text-ink",
  c: "bg-opt-c text-ink",
  outline: "border border-accent text-accent",
};

type PillProps = HTMLAttributes<HTMLSpanElement> & { tone?: PillTone; size?: "sm" | "md" };

export function Pill({ tone = "neutral", size = "md", className, ...rest }: PillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill font-semibold leading-none whitespace-nowrap",
        size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm",
        TONE[tone],
        className,
      )}
      {...rest}
    />
  );
}
