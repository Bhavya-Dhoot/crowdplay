"use client";
// The full-screen gold moment when a player's idea becomes canon (UX §3.3): 2.5 s, then it collapses
// into the gold toast (PlayerView shows that when onDone fires). Tap anywhere to skip.
import { useEffect } from "react";
import { m } from "@/components/ui/motion";
import { PLAY_COPY } from "./playCopy";
import styles from "./play.module.css";

export const CANON_MOMENT_MS = 2500;

async function fireworks(): Promise<void> {
  const { default: confetti } = await import("canvas-confetti");
  const colors = ["#FFD23F", "#FFE27A", "#FFFFFF", "#FF4D8D"];
  const shot = (x: number) =>
    void confetti({ particleCount: 60, spread: 80, startVelocity: 45, origin: { x, y: 0.6 }, colors, disableForReducedMotion: true, ticks: 180 });
  shot(0.2);
  shot(0.8);
  setTimeout(() => void confetti({ particleCount: 90, spread: 110, origin: { x: 0.5, y: 0.4 }, colors, disableForReducedMotion: true, ticks: 200 }), 350);
}

export function CanonMoment({ ideaText, reduced, onDone }: { ideaText: string; reduced: boolean; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, CANON_MOMENT_MS);
    return () => clearTimeout(t);
  }, [onDone]);

  useEffect(() => {
    if (!reduced) void fireworks();
  }, [reduced]);

  return (
    <m.div
      data-testid="receipt-moment"
      role="status"
      aria-live="assertive"
      onClick={onDone}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[55] flex cursor-pointer flex-col items-center justify-center gap-5 overflow-hidden bg-bg/95 px-8 text-center backdrop-blur-sm"
    >
      <div aria-hidden="true" className={`absolute inset-0 ${styles.rays}`} />
      <m.div
        aria-hidden="true"
        initial={{ scale: 0.3, rotate: -14 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 14 }}
        className="relative text-[88px] leading-none drop-shadow-[0_0_40px_rgb(255_210_63/0.7)]"
      >
        🏆
      </m.div>
      <m.h2
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.3 }}
        className="relative font-display text-[40px] leading-[1.02] font-extrabold text-accent"
      >
        {PLAY_COPY.play.reveal.canonBig}
      </m.h2>
      <m.blockquote
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.3 }}
        className="relative line-clamp-4 max-w-[30ch] rounded-card border border-accent/50 bg-surface px-4 py-3 text-lg leading-snug"
      >
        “{ideaText}”
      </m.blockquote>
      <p className="relative text-sm text-muted">{PLAY_COPY.play.reveal.canonSkip}</p>
      <span aria-hidden="true" className={`absolute inset-x-0 bottom-0 h-1.5 bg-accent ${styles.drain}`} style={{ ["--ms" as string]: `${CANON_MOMENT_MS}ms` }} />
    </m.div>
  );
}
