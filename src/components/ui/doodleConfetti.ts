// doodleConfetti: the one confetti look (design-v3). Ink stars, squiggles and yellow dots on the page, ~60 particles, one
// burst of about 1.2 s, once. Colours are only ink #1E1E22, yellow #FFD23F and faint ink #8A867D. Client only.
//   await fireDoodleConfetti()                                           a burst from the middle of the viewport
//   await fireDoodleConfetti({ origin: { x: 0.5, y: 0.35 }, scalar: 1.4 })
//   // your own canvas (the big screen's layer): pass its fire function from confetti.create(canvas, ...)
//   await fireDoodleConfetti({ fire: myFire })
// No-op under prefers-reduced-motion. The library is loaded on demand, so it never reaches pages that do not celebrate.
// Shapes come from text (a star, a four-point sparkle, a tilde, a dot): the colour is baked into each shape, so every
// glyph is made once per colour; if the browser cannot make them it falls back to plain circles and squares.
import type confettiNs from "canvas-confetti";

type Confetti = typeof confettiNs;
type Fire = (options?: confettiNs.Options) => unknown;

const DOODLE_COLORS = ["#1E1E22", "#FFD23F", "#8A867D"] as const;
const GLYPHS: { text: string; color: (typeof DOODLE_COLORS)[number] }[] = [
  { text: "✦", color: "#1E1E22" },
  { text: "★", color: "#FFD23F" },
  { text: "~", color: "#1E1E22" },
  { text: "•", color: "#FFD23F" },
  { text: "✦", color: "#8A867D" },
  { text: "•", color: "#1E1E22" },
];

/** Particle options for any fire function: doodle shapes and the three colours. */
function doodleOptions(confetti: Confetti, scalar = 1): confettiNs.Options {
  let shapes: confettiNs.Shape[];
  try {
    shapes = GLYPHS.map((g) => confetti.shapeFromText({ text: g.text, scalar: scalar * 3, color: g.color }));
  } catch {
    shapes = ["circle", "square"];
  }
  return {
    colors: [...DOODLE_COLORS],
    shapes,
    scalar: scalar * 3,
    particleCount: 60,
    spread: 85,
    startVelocity: 42,
    gravity: 1.05,
    ticks: 75,
    disableForReducedMotion: true,
  };
}

export async function fireDoodleConfetti(opts: { origin?: { x: number; y: number }; scalar?: number; fire?: Fire; zIndex?: number } = {}): Promise<void> {
  if (typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const { default: confetti } = await import("canvas-confetti");
  const fire: Fire = opts.fire ?? confetti;
  fire({ ...doodleOptions(confetti, opts.scalar ?? 1), origin: opts.origin ?? { x: 0.5, y: 0.6 }, zIndex: opts.zIndex ?? 60 });
}
