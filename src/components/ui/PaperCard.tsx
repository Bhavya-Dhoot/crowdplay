// PaperCard: the signature surface. A note laid on the page: paper-raised fill (it hides the dots), 2.5 px ink outline,
// hand-drawn radius and a grey marker shadow that always falls down-right. Server-safe.
//   <PaperCard tone="paper|paper-2" gel="a|b|c" edge="gold|wild" tilt={-2} seed={idea.id} alt pressable as="article" className="p-4">..</PaperCard>
//   paperCardClass({ tone, gel, edge, pressable, alt })     class string for a <button> that IS the card (vote cards)
// tone paper-2 = a slightly greyer sheet (stacked, narration page). gel adds a small ink letter tab over the top edge
// (decorative: the letter is always also written inside, see <LetterBadge>). edge gold = YOUR note (yellow edge + corner
// swash), wild = dashed outline (the wildcard). tilt = degrees; `seed` derives a stable -2.5..2.5 tilt from an id when
// you give no tilt. Both use the CSS `rotate` property, so framer-motion transforms on the same element keep working.
// alt = the alternate hand-drawn radius (use it on every other sibling). pressable = presses into its shadow.
// Pass rounded-element etc. in className for small cards. Text on paper is text-ink / text-ink-notes; the focus ring is ink.
import type { CSSProperties, HTMLAttributes } from "react";
import { cn } from "./cn";
import { tiltOf } from "./doodle";

type PaperTone = "paper" | "paper-2";
export type Gel = "a" | "b" | "c";

export function paperCardClass(o: { tone?: PaperTone; gel?: Gel; edge?: "gold" | "wild"; pressable?: boolean; alt?: boolean; className?: string } = {}): string {
  return cn(
    "paper",
    o.tone === "paper-2" && "paper-2",
    o.gel && `paper-gel-${o.gel}`,
    o.edge && `paper-edge-${o.edge}`,
    o.pressable && "press",
    o.alt && "paper-alt",
    o.className,
  );
}

type Props = HTMLAttributes<HTMLElement> & {
  tone?: PaperTone;
  gel?: Gel;
  edge?: "gold" | "wild";
  tilt?: number;
  seed?: string | number;
  alt?: boolean;
  pressable?: boolean;
  as?: "div" | "section" | "article" | "aside" | "li";
};

export function PaperCard({ tone, gel, edge, tilt, seed, alt, pressable, as: Tag = "div", className, style, ...rest }: Props) {
  const deg = tilt ?? (seed !== undefined ? tiltOf(seed) : 0);
  const s: CSSProperties | undefined = deg ? ({ "--tilt": `${deg}deg`, ...style } as CSSProperties) : style;
  return <Tag data-surface="paper" className={paperCardClass({ tone, gel, edge, pressable, alt, className })} style={s} {...rest} />;
}
