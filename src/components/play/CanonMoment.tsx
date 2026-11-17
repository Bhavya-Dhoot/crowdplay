"use client";
// The full-phone moment when a player's idea becomes canon (UX §3.3, design-v3): a sheet of dot-grid paper, "Your idea
// became canon" with the yellow marker swiped under "canon", the idea on a tilted note that the pen circles in yellow,
// the CANON ribbon written in, then ONE burst of doodle confetti and one buzz. After 2.5 s (or a tap) it collapses into
// the receipt toast (PlayerView shows that when onDone fires). It covers the player's own column only (absolute inside
// PlayerView). Reduced motion: every stroke appears complete, no confetti (the helper is a no-op), a plain placement.
import { useEffect, useRef } from "react";
import { fireDoodleConfetti } from "@/components/ui/doodleConfetti";
import { haptic } from "@/components/ui/motionTokens";
import { PaperCard } from "@/components/ui/PaperCard";
import { PenLoop } from "@/components/ui/PenLoop";
import { Ribbon } from "@/components/ui/Ribbon";
import { Swash } from "@/components/ui/Swash";
import { underlinePath } from "@/components/ui/doodle";
import { PLAY_COPY } from "./playCopy";
import styles from "./play.module.css";

const CANON_MOMENT_MS = 2500;
// When the pen starts each part (ms): the swash, the loop around the note, the ribbon, and the burst once it is written.
const SWASH_AT = 250;
const LOOP_AT = 350;
const RIBBON_AT = 900;
const CONFETTI_AT = 1250;
const BURST_FROM = { x: 0.5, y: 0.45 };

export function CanonMoment({ ideaText, onDone }: { ideaText: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, CANON_MOMENT_MS);
    return () => clearTimeout(t);
  }, [onDone]);

  // One buzz, even when React runs effects twice in development; the burst timer is re-armed with each run.
  const buzzed = useRef(false);
  useEffect(() => {
    if (!buzzed.current) {
      buzzed.current = true;
      haptic("canon");
    }
    const t = setTimeout(() => void fireDoodleConfetti({ origin: BURST_FROM, scalar: 1.2, zIndex: 65 }), CONFETTI_AT);
    return () => clearTimeout(t);
  }, []);

  const words = PLAY_COPY.play.reveal.canonBig;
  const cut = words.lastIndexOf(" ") + 1;
  return (
    <div
      data-testid="receipt-moment"
      role="status"
      aria-live="assertive"
      onClick={onDone}
      className={`dot-grid absolute inset-0 z-[55] flex cursor-pointer flex-col items-center justify-center gap-9 overflow-hidden px-6 text-center text-ink ${styles.settle}`}
    >
      <h2 className="relative max-w-[12ch] font-display text-display">
        {words.slice(0, cut)}
        <Swash play delayMs={SWASH_AT}>
          {words.slice(cut)}
        </Swash>
      </h2>
      {/* The ribbon sits outside the loop's wrapper so it is pinned on top of the pen line, not crossed by it. */}
      <div className="relative w-full max-w-[300px]">
        <PenLoop tone="yellow" boil shape="round" delayMs={LOOP_AT} seed="canon-moment" className="block">
          <PaperCard tilt={-2} className="block w-full px-5 py-5 text-left">
            <blockquote className="line-clamp-5 text-lead leading-[1.35] break-words">“{ideaText}”</blockquote>
          </PaperCard>
        </PenLoop>
        <Ribbon kind="canon" size="lg" delayMs={RIBBON_AT} className="absolute -right-3 -bottom-9 z-20" />
      </div>
      <p className="relative mt-3 text-body text-ink-notes">{PLAY_COPY.play.reveal.canonSkip}</p>
      <svg aria-hidden="true" viewBox="0 0 100 10" preserveAspectRatio="none" className="absolute inset-x-6 bottom-5 h-3 w-[calc(100%-48px)] overflow-visible" fill="none" stroke="var(--ink)" strokeWidth={2.5} strokeLinecap="round">
        <path d={underlinePath(100, 10, "canon-timer")} pathLength="1" className={styles.undraw} style={{ ["--ms" as string]: `${CANON_MOMENT_MS}ms` }} />
      </svg>
    </div>
  );
}
