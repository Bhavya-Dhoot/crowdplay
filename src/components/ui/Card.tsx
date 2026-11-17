// Card: a plain paper panel (paper-raised, 2.5 px ink outline, hand-drawn radius, grey marker shadow). Server-safe.
// For a note with a tilt, a letter tab or press feedback use <PaperCard>.
//   <Card tone="default|raised|accent|wild" as="section" className="p-6">..</Card>
// default = paper, raised = the greyer sheet (paper-2), accent = yellow edge (yours, the winner), wild = dashed outline.
import type { HTMLAttributes } from "react";
import { cn } from "./cn";

type CardTone = "default" | "raised" | "accent" | "wild";

const TONE: Record<CardTone, string> = {
  default: "",
  raised: "paper-2",
  accent: "paper-edge-gold",
  wild: "paper-edge-wild",
};

type CardProps = HTMLAttributes<HTMLElement> & { tone?: CardTone; as?: "div" | "section" | "article" | "aside" | "li" };

export function Card({ tone = "default", as: Tag = "div", className, ...rest }: CardProps) {
  return <Tag data-surface="paper" className={cn("paper p-4", TONE[tone], className)} {...rest} />;
}
