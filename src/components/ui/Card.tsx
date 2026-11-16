// Card: 16 px radius surface. Server-safe.
//   <Card tone="default|raised|accent|wild" as="section" className="p-6">..</Card>
// accent = gold outline (my idea, the winner); wild = pink outline (wildcard option).
import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export type CardTone = "default" | "raised" | "accent" | "wild";

const TONE: Record<CardTone, string> = {
  default: "border border-line bg-surface",
  raised: "border border-line bg-surface-2",
  accent: "glow-accent bg-surface",
  wild: "glow-wild bg-surface",
};

type CardProps = HTMLAttributes<HTMLElement> & { tone?: CardTone; as?: "div" | "section" | "article" | "aside" | "li" };

export function Card({ tone = "default", as: Tag = "div", className, ...rest }: CardProps) {
  return <Tag className={cn("rounded-card p-4", TONE[tone], className)} {...rest} />;
}
