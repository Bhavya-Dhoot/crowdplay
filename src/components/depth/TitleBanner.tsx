// The story poster's title: a paper banner with grey-marker notched tails (same parts as <Banner>), but built to wrap.
// <Banner> is one line by design (its outline is a single stretched path); a show title is 3 to 90 characters and wraps
// to several lines on a phone, so this draws the outline as a CSS border instead (see .dp-title in depth.css).
// Size it with className="[--b-px:30] md:[--b-px:46]" (the type size in px, unitless), like <Banner>.
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/components/ui/cn";

// A notched tail: the inner edge is tucked behind the face, the outer edge has a V cut into it (same as <Banner>).
const TAIL = "M30 3 H3 L11 20 L3 37 H30 Z";

function Tail({ side }: { side: "l" | "r" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 30 40" preserveAspectRatio="none" className={cn("banner-tail", side === "l" ? "banner-tail-l" : "banner-tail-r")}>
      <path d={TAIL} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function TitleBanner({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("banner dp-title placed", className)} style={{ "--tilt": "-1deg" } as CSSProperties}>
      <Tail side="l" />
      <span className="banner-face">{children}</span>
      <Tail side="r" />
    </span>
  );
}
