// Motion tokens (design-v3 "Motion"). Pure data and helpers: safe on the server, the client and in tests.
// CSS twins live in src/styles/tokens.css (--dur-*, --ease-*). Things are drawn or placed, never slid across.
//   import { DURATION, EASE, TRANSITION } from "@/components/ui/motionTokens";
//   <m.div transition={TRANSITION.medium} />
//   haptic("tap" | "reject" | "canon")    navigator.vibrate(12 | 30 | 60); no-op when unsupported or motion is reduced
// Frequent actions (typing, scrolling, changing a vote) get no flourish beyond press feedback.

/** Seconds, for framer-motion. */
export const DURATION = { fast: 0.175, medium: 0.41, slow: 0.975 } as const;

/** Arrivals and state changes ease out; exits accelerate away. */
export const EASE = { arrive: [0.24, 1, 0.4, 1], exit: [0.3, 0, 0.6, 0.6], pen: [0.55, 0, 0.35, 1] } as const;

/** How long the pen takes (ms): an outline, a check, the canon loop, the yellow marker swipe. */
export const DRAW_MS = { outline: 400, check: 220, loop: 700, swipe: 410 } as const;

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

