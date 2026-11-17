"use client";
// The one canvas on the screen: a transparent layer over the page where one burst of doodle confetti (ink stars,
// squiggles, yellow dots; see ui/doodleConfetti) fires when the CANON ribbon has been written in. Using our own canvas
// (not the library's default full-page one) keeps the burst inside the stage, which matters for the embedded mini
// screen and for OBS. The library is loaded on demand (and warmed up before the reveal) and never at all under
// reduced motion.
import type { CreateTypes } from "canvas-confetti";
import { useEffect, useRef } from "react";
import { fireDoodleConfetti } from "@/components/ui/doodleConfetti";

/** The ribbon lands: the winner's loop is drawn (250 + 700 ms) and the ribbon's outline and word follow. */
const IMPACT_MS = 1150;

export function ConfettiLayer({ fireKey, width, height, reduced, scalar }: { fireKey: string | null; width: number; height: number; reduced: boolean; scalar: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const fire = useRef<CreateTypes | null>(null);
  const reset = useRef<(() => void) | null>(null);
  // Read at fire time, so a window resize never re-fires the burst.
  const size = useRef(scalar);
  useEffect(() => {
    size.current = scalar;
  }, [scalar]);

  // Warm the chunk while the room is still voting, so the burst lands on the beat.
  useEffect(() => {
    if (!reduced) void import("canvas-confetti");
  }, [reduced]);

  useEffect(() => {
    if (!fireKey || reduced) {
      reset.current?.(); // leaving REVEAL clears whatever is still falling
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void import("canvas-confetti").then(({ default: confetti }) => {
      const el = canvas.current;
      if (cancelled || !el) return;
      if (!fire.current) {
        const f = confetti.create(el, { resize: false, useWorker: false, disableForReducedMotion: true });
        fire.current = f;
        reset.current = () => f.reset();
      }
      const shoot = fire.current;
      timer = setTimeout(() => {
        void fireDoodleConfetti({ fire: shoot, scalar: size.current, origin: { x: 0.5, y: 0.34 } });
      }, IMPACT_MS);
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [fireKey, reduced]);

  useEffect(() => () => reset.current?.(), []);

  return <canvas ref={canvas} width={width} height={height} aria-hidden="true" data-testid="screen-confetti" className="pointer-events-none absolute inset-0 z-[15] size-full" />;
}
