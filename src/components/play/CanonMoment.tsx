"use client";
// The full-screen gold moment when a player's idea becomes canon (UX §3.3): "Your idea became canon" on gold, the idea
// on a paper card that lands with the spring, an ink CANON stamp slamming on it, ONE confetti burst and one buzz. After
// 2.5 s (or a tap) it collapses into the gold toast (PlayerView shows that when onDone fires). It covers the player's
// own column only (absolute inside PlayerView). Reduced motion: no confetti, no rays, a plain fade.
import { useEffect, useRef } from "react";
import { m } from "@/components/ui/motion";
import { haptic, SPRING, TRANSITION } from "@/components/ui/motionTokens";
import { paperCardClass } from "@/components/ui/PaperCard";
import { Stamp } from "@/components/ui/Stamp";
import { PLAY_COPY } from "./playCopy";
import styles from "./play.module.css";

export const CANON_MOMENT_MS = 2500;

async function confettiBurst(): Promise<void> {
  const { default: confetti } = await import("canvas-confetti");
  void confetti({
    particleCount: 110,
    spread: 100,
    startVelocity: 46,
    origin: { x: 0.5, y: 0.5 },
    colors: ["#1C1828", "#F6F0E4", "#FFFFFF", "#FF3D7F", "#4C7DFF"],
    disableForReducedMotion: true,
    ticks: 200,
  });
}

export function CanonMoment({ ideaText, reduced, onDone }: { ideaText: string; reduced: boolean; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, CANON_MOMENT_MS);
    return () => clearTimeout(t);
  }, [onDone]);

  // One buzz and one burst, even when React runs effects twice in development.
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    haptic("canon");
    if (!reduced) void confettiBurst();
  }, [reduced]);

  return (
    <m.div
      data-testid="receipt-moment"
      role="status"
      aria-live="assertive"
      onClick={onDone}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: TRANSITION.fast }}
      exit={{ opacity: 0, scale: 0.97, transition: TRANSITION.exit }}
      className="absolute inset-0 z-[55] flex cursor-pointer flex-col items-center justify-center gap-7 overflow-hidden bg-gold px-6 text-center text-ink"
    >
      <div aria-hidden="true" className={`absolute inset-0 ${styles.rays}`} />
      <m.h2
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, ...TRANSITION.medium }}
        className="relative max-w-[12ch] font-display text-[44px] leading-[1.02] font-extrabold"
      >
        {PLAY_COPY.play.reveal.canonBig}
      </m.h2>
      <m.div
        data-surface="paper"
        initial={{ opacity: 0, y: 36, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.2, ...SPRING.land }}
        className={paperCardClass({ className: "relative w-full max-w-[320px] px-5 py-5 text-left" })}
        style={{ ["--tilt" as string]: "-2deg" }}
      >
        <blockquote className="line-clamp-5 font-script text-[22px] leading-[1.35] font-semibold break-words">“{ideaText}”</blockquote>
        <Stamp kind="canon" size="lg" delayMs={reduced ? 0 : 520} className="absolute -right-3 -bottom-5 z-10 [--stamp-bg:var(--ink)] [--stamp-fg:var(--gold)]" />
      </m.div>
      <p className="relative text-small font-medium">{PLAY_COPY.play.reveal.canonSkip}</p>
      <span aria-hidden="true" className={`absolute inset-x-0 bottom-0 h-1.5 bg-ink ${styles.drain}`} style={{ ["--ms" as string]: `${CANON_MOMENT_MS}ms` }} />
    </m.div>
  );
}
