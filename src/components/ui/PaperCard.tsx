// PaperCard: the signature surface. A warm paper index card with a crisp contact shadow. Server-safe.
//   <PaperCard tone="paper|paper-2" gel="a|b|c" edge="gold|wild" tilt={-2} pressable as="article" className="p-4">..</PaperCard>
//   paperCardClass({ tone, gel, edge, pressable })     class string for a <button> that IS the card (vote cards)
// tone paper-2 = pressed or stacked. gel adds the 6 px top band in the option colour (decorative: always also show
// the letter, see <GelDisc>). edge gold = "my idea", wild = wildcard option. tilt = degrees, applied with the CSS
// `rotate` property so framer-motion transforms on the same element keep working (rain: -3..3).
// Radius is 16 (rounded-card) by default; pass rounded-element etc. in className for small cards. pressable = the 0 ms press feedback for tappable cards. Text on paper is text-ink / text-ink-muted; the focus ring
// inside a paper card turns to ink (gold would vanish). Never put glass on paper.
import type { CSSProperties, HTMLAttributes } from "react";
import { cn } from "./cn";

export type PaperTone = "paper" | "paper-2";
export type Gel = "a" | "b" | "c";

export function paperCardClass(o: { tone?: PaperTone; gel?: Gel; edge?: "gold" | "wild"; pressable?: boolean; className?: string } = {}): string {
  return cn(
    "paper",
    o.tone === "paper-2" && "paper-2",
    o.gel && `paper-gel-${o.gel}`,
    o.edge && `paper-edge-${o.edge}`,
    o.pressable && "press",
    o.className,
  );
}

type Props = HTMLAttributes<HTMLElement> & {
  tone?: PaperTone;
  gel?: Gel;
  edge?: "gold" | "wild";
  tilt?: number;
  pressable?: boolean;
  as?: "div" | "section" | "article" | "aside" | "li";
};

export function PaperCard({ tone, gel, edge, tilt, pressable, as: Tag = "div", className, style, ...rest }: Props) {
  const s: CSSProperties | undefined = tilt ? ({ "--tilt": `${tilt}deg`, ...style } as CSSProperties) : style;
  return <Tag data-surface="paper" className={paperCardClass({ tone, gel, edge, pressable, className })} style={s} {...rest} />;
}
