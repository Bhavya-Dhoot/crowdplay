"use client";
// The one canvas on the screen: a transparent layer over the stage where canvas-confetti bursts on
// the reveal. The library is loaded on demand and never at all under reduced motion. Using our own
// canvas (not the library's default full-page one) keeps the burst inside the stage, which matters
// for the embedded mini screen and for OBS.
import { useEffect, useRef } from "react";

type Fire = (opts: Record<string, unknown>) => unknown;

const COLORS = ["#FFD23F", "#FF4D8D", "#5B8CFF", "#3DDC97", "#F5F5FA"];

export function ConfettiLayer({ fireKey, width, height, reduced, scalar }: { fireKey: string | null; width: number; height: number; reduced: boolean; scalar: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const fire = useRef<Fire | null>(null);
  const reset = useRef<(() => void) | null>(null);
  // Read at fire time, so a window resize never re-fires the burst.
  const size = useRef(scalar);
  useEffect(() => {
    size.current = scalar;
  }, [scalar]);

  useEffect(() => {
    if (!fireKey || reduced) {
      reset.current?.(); // leaving REVEAL clears whatever is still falling
      return;
    }
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    void import("canvas-confetti").then(({ default: confetti }) => {
      const el = canvas.current;
      if (cancelled || !el) return;
      if (!fire.current) {
        const f = confetti.create(el, { resize: false, useWorker: false, disableForReducedMotion: true });
        fire.current = f as unknown as Fire;
        reset.current = () => f.reset();
      }
      const shoot = fire.current;
      const base = { colors: COLORS, scalar: size.current, ticks: 240, gravity: 0.95, disableForReducedMotion: true };
      shoot({ ...base, particleCount: 110, spread: 90, startVelocity: 58, origin: { x: 0.5, y: 0.66 } });
      timers.push(setTimeout(() => shoot({ ...base, particleCount: 60, angle: 58, spread: 62, startVelocity: 62, origin: { x: 0, y: 0.9 } }), 220));
      timers.push(setTimeout(() => shoot({ ...base, particleCount: 60, angle: 122, spread: 62, startVelocity: 62, origin: { x: 1, y: 0.9 } }), 220));
    });
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [fireKey, reduced]);

  useEffect(() => () => reset.current?.(), []);

  return <canvas ref={canvas} width={width} height={height} aria-hidden="true" data-testid="screen-confetti" className="pointer-events-none absolute inset-0 z-30 size-full" />;
}
