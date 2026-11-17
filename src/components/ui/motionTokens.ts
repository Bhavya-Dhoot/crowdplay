// Motion tokens (design-v3 "Motion"). Pure data and helpers: safe on the server, the client and in tests.
// CSS twins live in src/styles/tokens.css (--dur-*, --ease-*). Things are drawn or placed, never slid across.
//   import { DURATION, EASE, SPRING, TRANSITION } from "@/components/ui/motionTokens";
//   <m.div transition={SPRING.stamp} />   <m.div transition={TRANSITION.medium} />
//   springToLinear(420, 22)               { easing: "linear(...)", durationMs } -> a CSS spring with no JS animation lib
//   haptic("tap" | "reject" | "canon")    navigator.vibrate(12 | 30 | 60); no-op when unsupported or motion is reduced
// Overshoot is allowed ONLY on arrivals with meaning (idea card landing, the CANON stamp, the winner lift).
// Frequent actions (typing, scrolling, changing a vote) get no flourish beyond press feedback.

/** Seconds, for framer-motion. */
export const DURATION = { fast: 0.175, medium: 0.41, slow: 0.975 } as const;
export const DURATION_MS = { fast: 175, medium: 410, slow: 975 } as const;

/** Arrivals and state changes ease out; exits accelerate away. */
export const EASE = { arrive: [0.24, 1, 0.4, 1], exit: [0.3, 0, 0.6, 0.6], pen: [0.55, 0, 0.35, 1] } as const;

/** How long the pen takes (ms): an outline, a check, the canon loop, the yellow marker swipe. */
export const DRAW_MS = { outline: 400, check: 220, loop: 700, swipe: 410 } as const;

/** Spring params (mass 1). Stiffness/damping from the Apple/Astryx response-damping pairs, see plans/design-sources.md. */
export const SPRING = {
  /** CANON stamp: scale 1.35 -> 1, rotate -8 -> -4 degrees. */
  stamp: { type: "spring", stiffness: 420, damping: 22 },
  /** An idea card landing on the desk. */
  land: { type: "spring", stiffness: 260, damping: 20 },
  /** The winner card lifting. */
  lift: { type: "spring", stiffness: 300, damping: 24 },
  /** Sheets and menus: critically damped, no bounce. */
  settle: { type: "spring", stiffness: 439, damping: 42 },
} as const;

/** Ready-made framer transitions. */
export const TRANSITION = {
  fast: { duration: DURATION.fast, ease: EASE.arrive },
  medium: { duration: DURATION.medium, ease: EASE.arrive },
  slow: { duration: DURATION.slow, ease: EASE.arrive },
  exit: { duration: DURATION.fast, ease: EASE.exit },
} as const;

/** Vibration patterns in ms. Optional polish: iOS Safari ignores them, so never depend on one. */
const HAPTIC_MS = { tap: 12, reject: 30, canon: 60 } as const;

/** Short buzz for a vote or send (tap), a rejected idea (reject) and for becoming canon. Muted by reduced motion. */
export function haptic(kind: keyof typeof HAPTIC_MS): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  navigator.vibrate(HAPTIC_MS[kind]);
}

type SpringCss = { easing: string; durationMs: number };

/**
 * A damped spring (step response from 0 to 1, mass 1 by default) as a CSS `linear()` easing, so
 * server components can animate with plain CSS keyframes. Overshoot shows as values above 1.
 * `durationMs` is when the motion has settled to within 0.1 percent (capped at 1.6 s).
 */
export function springToLinear(stiffness: number, damping: number, mass = 1, samples = 32): SpringCss {
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const decay = Math.max(zeta * w0, 1e-6);
  const settle = Math.min(1.6, Math.log(1000) / decay);
  const step = (t: number): number => {
    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      return 1 - Math.exp(-decay * t) * (Math.cos(wd * t) + (decay / wd) * Math.sin(wd * t));
    }
    return 1 - Math.exp(-w0 * t) * (1 + w0 * t); // critically damped; overdamped is close enough for UI
  };
  const points: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const v = i === samples ? 1 : step((settle * i) / samples);
    points.push(String(Math.round(v * 1000) / 1000));
  }
  return { easing: `linear(${points.join(", ")})`, durationMs: Math.round(settle * 1000) };
}
