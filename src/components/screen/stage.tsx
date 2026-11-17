"use client";
// Shared pieces for the big screen: stage geometry, the context every view reads, and small parts.
//
// The stage is a design canvas (1920 x 1080 for a projector or OBS, 840 x 473 for the embedded mini
// screen) that ScreenStage fits to whatever box it lives in. It is scaled by size, not by CSS
// transform: the root is (canvas x k) px wide with font-size 28 x k px, sizes inside are written in em,
// and Tailwind's spacing unit is overridden to 0.25em on the root, so p-4, gap-2 and friends follow.
// Anything that needs real pixels (rings, QR codes, avatars, banner type) goes through px(n), which
// is n canvas pixels times k; lines, shadows and radii use `calc(var(--u) * n)` in screen.css (--u = k px).
// Doing it this way keeps text crisp at any size and keeps Framer Motion's layout animations correct
// (they break inside a transform-scaled parent). The mini canvas is smaller on purpose: at ~480 px
// wide the same em sizes come out about 16 px, which stays readable.
import { Zap } from "lucide-react";
import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/components/ui/cn";
import { LetterBadge } from "@/components/ui/LetterBadge";
import type { Credit, OptionSlot } from "@/lib/realtime/types";

type StageMetrics = { w: number; h: number; header: number; footer: number; padX: number };
export const FULL_STAGE: StageMetrics = { w: 1920, h: 1080, header: 132, footer: 96, padX: 72 };
export const COMPACT_STAGE: StageMetrics = { w: 840, h: 473, header: 60, footer: 0, padX: 24 };
export const STAGE_FONT_PX = 28;

export type StageCtx = {
  code: string;
  compact: boolean;
  obs: boolean;
  /** Whether QR codes may appear (always, except OBS without &qr=1). */
  showQr: boolean;
  origin: string;
  host: string;
  offsetMs: number;
  reduced: boolean;
  metrics: StageMetrics;
  /** Fit factor: real px per canvas px. */
  k: number;
  /** Canvas pixels to real pixels. */
  px: (n: number) => number;
};

const Ctx = createContext<StageCtx | null>(null);
export const StageProvider = Ctx.Provider;

export function useStage(): StageCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStage must be used inside <ScreenStage>");
  return c;
}

/** A note's tilt as a style: the CSS `rotate` property reads --tilt (see .cps-box in screen.css). */
export function tiltStyle(deg: number): CSSProperties {
  return { ["--tilt" as string]: `${deg}deg` };
}

/** Banner type size in real px, as the unitless custom property the Banner primitive reads. */
export function bannerStyle(realPx: number): CSSProperties {
  return { ["--b-px" as string]: Math.round(realPx * 10) / 10 };
}

/** The option's letter (or the wildcard bolt) in its hand-drawn blob: option identity is never colour. */
export function OptionBadge({ slot, size, className }: { slot: OptionSlot; size: number; className?: string }) {
  const { px } = useStage();
  return (
    <span aria-hidden="true" className={cn("inline-flex shrink-0", className)}>
      <LetterBadge letter={slot} size={px(size)} animate={false} />
    </span>
  );
}

/** Small label sized for a big screen (the Pill primitive is phone-sized): paper, ink outline, pill radius. */
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[0.3em] rounded-pill border-[length:var(--bw-s)] border-ink bg-paper-raised px-[0.7em] py-[0.3em] text-[0.72em] leading-none whitespace-nowrap text-ink",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** The demo's honest label on a boosted wildcard: an ink bolt and plain words. */
export function BoostedTag({ className }: { className?: string }) {
  return (
    <Tag className={className}>
      <Zap aria-hidden="true" className="size-[1em] shrink-0" fill="currentColor" />
      boosted in demo
    </Tag>
  );
}

/** Overlapping initials avatars for up to three credited people (the ring matches the surface they sit on). */
export function CreditAvatars({ credit, size, className, ring = "ring-paper-raised" }: { credit: readonly Credit[]; size: number; className?: string; ring?: string }) {
  const { px } = useStage();
  if (credit.length === 0) return null;
  return (
    <span className={cn("flex shrink-0 [&>*+*]:-ml-[0.4em]", className)}>
      {credit.slice(0, 3).map((c) => (
        <Avatar key={c.name} name={c.name} size={px(size)} className={cn("ring-[3px]", ring)} />
      ))}
    </span>
  );
}

/** Three ink dots that take turns: "the narrator is writing". */
export function TypingDots() {
  return (
    <span aria-hidden="true" className="cps-dots inline-flex items-center">
      <span />
      <span />
      <span />
    </span>
  );
}
