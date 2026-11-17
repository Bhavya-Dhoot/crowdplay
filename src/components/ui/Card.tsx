// Card: a stage panel (raised ink, 16 px radius, hairline border). Server-safe. For paper, use <PaperCard>.
//   <Card tone="default|raised|accent|wild" as="section" className="p-6">..</Card>
// default = stage-1, raised = stage-2, accent = gold outline (my idea, the winner), wild = magenta outline (wildcard).
// No glows and no glass here: glass is for floating layers only.
import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export type CardTone = "default" | "raised" | "accent" | "wild";

const TONE: Record<CardTone, string> = {
  default: "border border-stage-line bg-stage-1",
  raised: "border border-stage-line bg-stage-2",
  accent: "glow-accent bg-stage-1",
  wild: "glow-wild bg-stage-1",
};

type CardProps = HTMLAttributes<HTMLElement> & { tone?: CardTone; as?: "div" | "section" | "article" | "aside" | "li" };

export function Card({ tone = "default", as: Tag = "div", className, ...rest }: CardProps) {
  return <Tag className={cn("rounded-card p-4", TONE[tone], className)} {...rest} />;
}
