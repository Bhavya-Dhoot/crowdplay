"use client";
// The one canvas on the screen: a transparent layer BEHIND the content where canvas-confetti fires one short burst
// (under 2 s) when the CANON stamp lands. Because it sits under the winner's paper page, the confetti frames the
// page and never crosses the narration. The library is loaded on demand (and warmed up before the reveal) and
// never at all under reduced motion. Using our own canvas (not the library's default full-page one) keeps the
// burst inside the stage, which matters for the embedded mini screen and for OBS.
import { useEffect, useRef } from "react";
import { ROUND_LIGHTS } from "@/components/ui/stageLight";

type Fire = (opts: Record<string, unknown>) => unknown;

/** The stamp's impact: the winner page lifts (about 340 ms) and the stamp lands a beat after. */
const IMPACT_MS = 600;
/** ~60 frames per second: 90 ticks is about 1.5 s, so the whole burst is gone inside 2 s. */
const TICKS = 90;

export function ConfettiLayer({ fireKey, width, height, reduced, scalar }: { fireKey: string | null; width: number; height: number; reduced: boolean; scalar: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const fire = useRef<Fire | null>(null);
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
        fire.current = f as unknown as Fire;
        reset.current = () => f.reset();
      }
      const shoot = fire.current;
      // Colours: the three gels, the stage lights and paper. Gold is left to the CANON stamp.
      const colors = ["#4C7DFF", "#22C58B", "#FF3D7F", ...ROUND_LIGHTS, "#F6F0E4"];
      const base = { colors, scalar: size.current, ticks: TICKS, gravity: 1.15, disableForReducedMotion: true };
      timer = setTimeout(() => {
        shoot({ ...base, particleCount: 70, angle: 62, spread: 55, startVelocity: 62, origin: { x: 0.02, y: 0.95 } });
        shoot({ ...base, particleCount: 70, angle: 118, spread: 55, startVelocity: 62, origin: { x: 0.98, y: 0.95 } });
        shoot({ ...base, particleCount: 50, spread: 120, startVelocity: 38, origin: { x: 0.5, y: 0.1 } });
      }, IMPACT_MS);
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [fireKey, reduced]);

  useEffect(() => () => reset.current?.(), []);

  return <canvas ref={canvas} width={width} height={height} aria-hidden="true" data-testid="screen-confetti" className="pointer-events-none absolute inset-0 z-[5] size-full" />;
}
