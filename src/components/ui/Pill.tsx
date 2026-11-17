// Pill: small rounded label. Server-safe.
//   <Pill tone="neutral|accent|ok|warn|danger|wild|a|b|c|outline|paper" size="sm|md">text or icon + text</Pill>
// Tones a/b/c are the option gels: always put the letter (A/B/C) or an icon inside, never colour alone. Text is --ink
// on every bright fill (AA). accent = gold, the same "canon / primary" gold as the button: use it sparingly.
// paper = a paper pill (on stage). Text is never smaller than 13 px.
import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export type PillTone = "neutral" | "accent" | "ok" | "warn" | "danger" | "wild" | "a" | "b" | "c" | "outline" | "paper";

const TONE: Record<PillTone, string> = {
  neutral: "border border-stage-line bg-stage-2 text-muted-on-stage",
  accent: "bg-gold text-ink",
  ok: "bg-ok text-ink",
  warn: "bg-warn text-ink",
  danger: "bg-danger text-ink",
  wild: "bg-gel-c text-ink",
  a: "bg-gel-a text-ink",
  b: "bg-gel-b text-ink",
  c: "bg-gel-c text-ink",
  outline: "border border-gold text-gold",
  paper: "bg-paper text-ink",
};

type PillProps = HTMLAttributes<HTMLSpanElement> & { tone?: PillTone; size?: "sm" | "md" };

export function Pill({ tone = "neutral", size = "md", className, ...rest }: PillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill font-semibold leading-none whitespace-nowrap",
        size === "sm" ? "px-2 py-1 text-fine" : "px-3 py-1.5 text-small",
        TONE[tone],
        className,
      )}
      {...rest}
    />
  );
}
