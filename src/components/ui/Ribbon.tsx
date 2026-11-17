// Ribbon: the label banner (the old rubber stamp). A yellow-faced banner with an ink outline and grey-marker notched
// tails, like the poster's "1 SIP" ribbons. Server-safe.
//   <Ribbon kind="canon|wildcard|narrator|demo" size="sm|md|lg|xl" animate delayMs boil className />
//   canon    yellow "CANON": the outline is drawn, then the word is written (once, on mount)
//   wildcard paper "WILDCARD", dashed outline, no yellow
//   narrator paper "NARRATOR'S PICK", no yellow
//   demo     paper "DEMO", no yellow (the honest label on the 2-minute demo)
// animate (default true) only matters for canon; reduced motion shows it complete. Position it yourself (absolute over
// a card corner, e.g. "absolute -top-3 right-3"); it never changes layout. Pair the canon ribbon with haptic("canon").
// Recolour the face with className="[--stamp-bg:var(--ink)] [--stamp-fg:var(--hl-solid)]".
// boil = the ink wobble on the outline, for the CANON ribbon while REVEAL is on screen (see doodleConfetti for the burst).
import type { CSSProperties } from "react";
import { COPY } from "@/lib/copy";
import { Banner, type BannerSize } from "./Banner";

export type RibbonKind = "canon" | "wildcard" | "narrator" | "demo";

const LABEL: Record<RibbonKind, string> = {
  canon: "Canon",
  wildcard: "Wildcard",
  narrator: COPY.reveal.narratorPick,
  demo: "Demo",
};

type Props = {
  kind?: RibbonKind;
  size?: BannerSize;
  animate?: boolean;
  delayMs?: number;
  boil?: boolean;
  className?: string;
  style?: CSSProperties;
};

export function Ribbon({ kind = "canon", size = "md", animate = true, delayMs = 0, boil = false, className, style }: Props) {
  return (
    <Banner
      tone={kind === "canon" ? "yellow" : "paper"}
      dashed={kind === "wildcard"}
      size={size}
      play={animate && kind === "canon"}
      delayMs={delayMs}
      boil={boil}
      seed={`ribbon-${kind}`}
      className={className}
      style={style}
    >
      {LABEL[kind]}
    </Banner>
  );
}
