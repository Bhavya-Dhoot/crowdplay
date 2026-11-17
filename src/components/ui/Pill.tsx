// Pill: a small label on paper with a 2 px ink outline and a hand-drawn pill radius. Server-safe.
//   <Pill tone="neutral|accent|ok|warn|danger|wild|a|b|c|outline|paper" size="sm|md" active>text or icon + text</Pill>
// active (or tone accent / warn) = the yellow marker behind the label: "this is the thing to look at". Everything else is
// ink on paper. danger = --danger text and outline (pair with an icon and words). wild / outline = dashed outline.
// ok, a, b, c, paper, neutral are all plain paper chips (a/b/c still need the letter inside; ok needs words or a PenCheck).
// Text is never smaller than 15 px.
import type { HTMLAttributes } from "react";
import { cn } from "./cn";

type PillTone = "neutral" | "accent" | "ok" | "warn" | "danger" | "wild" | "a" | "b" | "c" | "outline" | "paper";

const TONE: Record<PillTone, string> = {
  neutral: "text-ink-notes",
  accent: "text-ink",
  ok: "text-ink",
  warn: "text-ink",
  danger: "border-danger text-danger",
  wild: "border-dashed text-ink",
  a: "text-ink",
  b: "text-ink",
  c: "text-ink",
  outline: "border-dashed text-ink",
  paper: "text-ink",
};

type PillProps = HTMLAttributes<HTMLSpanElement> & { tone?: PillTone; size?: "sm" | "md"; active?: boolean };

export function Pill({ tone = "neutral", size = "md", active, className, ...rest }: PillProps) {
  const yellow = active || tone === "accent" || tone === "warn";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill border-2 border-ink font-display leading-none whitespace-nowrap",
        yellow ? "pill-active" : "bg-paper-raised",
        size === "sm" ? "px-2.5 py-1 text-fine" : "px-3.5 py-1.5 text-small",
        TONE[tone],
        className,
      )}
      {...rest}
    />
  );
}
