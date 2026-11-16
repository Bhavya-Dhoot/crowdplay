"use client";
// Shared pieces for the big screen: stage geometry, the context every view reads, and small parts.
//
// The stage is a design canvas (1920 x 1080 for a projector or OBS, 840 x 473 for the embedded mini
// screen) that ScreenStage fits to whatever box it lives in. It is scaled by size, not by CSS
// transform: the root is (canvas x k) px wide with font-size 28 x k px, sizes inside are written in em,
// and Tailwind's spacing unit is overridden to 0.25em on the root, so p-4, gap-2 and friends follow.
// Anything that needs real pixels (rings, QR codes, avatars, fixed bands) goes through px(n), which
// is n canvas pixels times k. Doing it this way keeps text crisp at any size and keeps Framer
// Motion's layout animations correct (they break inside a transform-scaled parent). The mini canvas
// is smaller on purpose: at ~480 px wide the same em sizes come out about 16 px, which stays readable.
import { Zap } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/components/ui/cn";
import type { Credit, OptionSlot } from "@/lib/realtime/types";

export type StageMetrics = { w: number; h: number; header: number; footer: number; padX: number };
export const FULL_STAGE: StageMetrics = { w: 1920, h: 1080, header: 150, footer: 96, padX: 72 };
export const COMPACT_STAGE: StageMetrics = { w: 840, h: 473, header: 64, footer: 0, padX: 24 };
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

const SLOT_BG: Record<OptionSlot, string> = { A: "bg-opt-a", B: "bg-opt-b", C: "bg-opt-c" };

/** A/B letter or the wildcard bolt: option identity is never colour alone. */
export function OptionBadge({ slot, size, className }: { slot: OptionSlot; size: number; className?: string }) {
  const { px } = useStage();
  return (
    <span
      aria-hidden="true"
      className={cn("inline-grid shrink-0 place-items-center rounded-full font-display font-extrabold leading-none text-ink", SLOT_BG[slot], className)}
      style={{ width: px(size), height: px(size), fontSize: px(size * 0.58) }}
    >
      {slot === "C" ? <Zap fill="currentColor" strokeWidth={1.5} style={{ width: px(size * 0.55), height: px(size * 0.55) }} /> : slot}
    </span>
  );
}

const TAG_TONE = {
  wild: "bg-wild text-ink",
  accent: "bg-accent text-ink",
  outline: "border-2 border-accent text-accent",
  muted: "border-2 border-line text-muted",
} as const;

/** Small label sized for a big screen (the Pill primitive is phone-sized). */
export function Tag({ tone, children, className }: { tone: keyof typeof TAG_TONE; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[0.3em] rounded-pill px-[0.7em] py-[0.32em] text-[0.62em] leading-none font-bold whitespace-nowrap",
        TAG_TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Overlapping initials avatars for up to three credited people. */
export function CreditAvatars({ credit, size, className }: { credit: readonly Credit[]; size: number; className?: string }) {
  const { px } = useStage();
  if (credit.length === 0) return null;
  return (
    <span className={cn("flex shrink-0 [&>*+*]:-ml-[0.4em]", className)}>
      {credit.slice(0, 3).map((c) => (
        <Avatar key={c.name} name={c.name} size={px(size)} className="ring-[3px] ring-surface" />
      ))}
    </span>
  );
}

/** Three pulsing dots: "the narrator is writing". */
export function TypingDots() {
  return (
    <span aria-hidden="true" className="cps-dots inline-flex items-center">
      <span />
      <span />
      <span />
    </span>
  );
}
