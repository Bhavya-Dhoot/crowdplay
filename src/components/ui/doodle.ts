// Seeded hand-drawn geometry for the sketchnote primitives (design-v3). Pure and server-safe.
// Everything is a function of a stable key (an id, a slot, an index), so the server and the browser draw the same
// stroke: no Math.random, and no trig either (only + - * /, which every engine rounds identically), so SSR and
// hydration cannot disagree.
//   seeded("idea-42")()          0..1, the same sequence every time
//   tiltOf("idea-42", 2.5)       -2.5..2.5 degrees, one decimal: a note's tilt
//   loopPath(w, h, key)          an ellipse drawn by hand around a w x h box, overshooting where it started
//   roundLoopPath(w, h, key)     a rounded rectangle drawn in one hand-drawn loop (around cards), overshooting its start
//   ringPath(size, stroke, key)  a closed hand-drawn circle that starts at the top and runs clockwise (timers)
//   boxPath(w, h, key)           a rectangle drawn in one stroke, overshooting its start
//   checkPath(key)               a pen check in a 24 x 24 box
//   underlinePath(w, h, key)     a wavy underline in a w x h box
//   arrowPath(w, h, key)         a fat arrow outline (pointing right) in a w x h box
// All paths are single strokes (one M), so `pathLength="1"` + stroke-dashoffset draws them from start to end.
import { isValidElement, type ReactNode } from "react";

/** FNV-1a over the string form of the key. */
export function hash32(key: string | number): number {
  const s = String(key);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a small seeded generator returning 0 <= n < 1. */
export function seeded(key: string | number): () => number {
  let a = hash32(key) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable tilt in degrees for a note, -max..max, one decimal. */
export function tiltOf(key: string | number, max = 2.5): number {
  return Math.round((seeded(key)() * 2 - 1) * max * 10) / 10;
}

const n = (v: number): string => {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? "0" : String(r);
};
const pt = (x: number, y: number): string => `${n(x)} ${n(y)}`;

const KAPPA = 0.5523;

export function loopPath(w: number, h: number, key: string | number, pad = 3): string {
  const r = seeded(key);
  const j = (s: number) => (r() * 2 - 1) * s;
  const cx = w / 2;
  const cy = h / 2;
  const rx = Math.max(1, w / 2 - pad);
  const ry = Math.max(1, h / 2 - pad);
  // Start a little left of the top, go clockwise, and end past the start (a second, slightly larger arc).
  const p0 = [cx - rx * 0.18 + j(1), cy - ry + j(1)];
  const p1 = [cx + rx + j(1.2), cy + j(ry * 0.08)];
  const p2 = [cx + j(rx * 0.06), cy + ry + j(1)];
  const p3 = [cx - rx + j(1.2), cy + j(ry * 0.08)];
  const p4 = [cx + rx * 0.22, cy - ry * 1.04 + j(0.8)];
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return [
    `M${pt(p0[0], p0[1])}`,
    `C${pt(p0[0] + kx * 1.05, p0[1])} ${pt(p1[0], p1[1] - ky)} ${pt(p1[0], p1[1])}`,
    `C${pt(p1[0], p1[1] + ky)} ${pt(p2[0] + kx, p2[1])} ${pt(p2[0], p2[1])}`,
    `C${pt(p2[0] - kx, p2[1])} ${pt(p3[0], p3[1] + ky)} ${pt(p3[0], p3[1])}`,
    `C${pt(p3[0], p3[1] - ky)} ${pt(p4[0] - kx * 0.9, p4[1])} ${pt(p4[0], p4[1])}`,
  ].join(" ");
}

export function roundLoopPath(w: number, h: number, key: string | number, pad = 3): string {
  const r = seeded(key);
  const j = (s: number) => (r() * 2 - 1) * s;
  const x0 = pad;
  const y0 = pad;
  const x1 = w - pad;
  const y1 = h - pad;
  const rad = Math.max(2, Math.min(26, (x1 - x0) / 4, (y1 - y0) / 3));
  const k = rad * KAPPA;
  const sx = x0 + rad * 1.6 + j(1);
  return [
    `M${pt(sx, y0 + j(0.8))}`,
    `L${pt(x1 - rad, y0 + j(0.8))}`,
    `C${pt(x1 - rad + k, y0)} ${pt(x1, y0 + rad - k)} ${pt(x1 + j(0.8), y0 + rad)}`,
    `L${pt(x1 + j(0.8), y1 - rad)}`,
    `C${pt(x1, y1 - rad + k)} ${pt(x1 - rad + k, y1)} ${pt(x1 - rad, y1 + j(0.8))}`,
    `L${pt(x0 + rad, y1 + j(0.8))}`,
    `C${pt(x0 + rad - k, y1)} ${pt(x0, y1 - rad + k)} ${pt(x0 + j(0.8), y1 - rad)}`,
    `L${pt(x0 + j(0.8), y0 + rad)}`,
    `C${pt(x0, y0 + rad - k)} ${pt(x0 + rad - k, y0 - 1)} ${pt(x0 + rad, y0 - 1.5)}`,
    `L${pt(x0 + rad * 2.6, y0 - 3)}`,
  ].join(" ");
}

export function ringPath(size: number, stroke: number, key: string | number): string {
  const r = seeded(key);
  const rad = (size - stroke) / 2;
  const c = size / 2;
  const j = () => (r() * 2 - 1) * rad * 0.03;
  const k = rad * KAPPA;
  const top = [c + j(), c - rad + j()];
  const right = [c + rad + j(), c + j()];
  const bottom = [c + j(), c + rad + j()];
  const left = [c - rad + j(), c + j()];
  return [
    `M${pt(top[0], top[1])}`,
    `C${pt(top[0] + k, top[1])} ${pt(right[0], right[1] - k)} ${pt(right[0], right[1])}`,
    `C${pt(right[0], right[1] + k)} ${pt(bottom[0] + k, bottom[1])} ${pt(bottom[0], bottom[1])}`,
    `C${pt(bottom[0] - k, bottom[1])} ${pt(left[0], left[1] + k)} ${pt(left[0], left[1])}`,
    `C${pt(left[0], left[1] - k)} ${pt(top[0] - k, top[1])} ${pt(top[0], top[1])}`,
  ].join(" ");
}

export function boxPath(w: number, h: number, key: string | number): string {
  const r = seeded(key);
  const j = (s: number) => (r() * 2 - 1) * s;
  const c = Math.min(1.4, w / 4, h / 4);
  const o = Math.min(3, w / 6);
  const t = j(0.35);
  const rgt = w + j(0.35);
  const b = h + j(0.35);
  const l = j(0.35);
  return [
    `M${pt(l + c, t)}`,
    `L${pt(rgt - c, t + j(0.2))}`,
    `Q${pt(rgt + 0.3, t - 0.2)} ${pt(rgt, t + c)}`,
    `L${pt(rgt + j(0.25), b - c)}`,
    `Q${pt(rgt, b + 0.3)} ${pt(rgt - c, b)}`,
    `L${pt(l + c, b + j(0.2))}`,
    `Q${pt(l - 0.3, b)} ${pt(l, b - c)}`,
    `L${pt(l + j(0.25), t + c)}`,
    `Q${pt(l, t - 0.2)} ${pt(l + c + o, t + 0.1)}`,
  ].join(" ");
}

export function checkPath(key: string | number): string {
  const r = seeded(key);
  const j = (s: number) => (r() * 2 - 1) * s;
  return [
    `M${pt(3 + j(0.5), 12.8 + j(0.5))}`,
    `C${pt(5.2, 14.2)} ${pt(7.6, 17.2)} ${pt(9.2 + j(0.4), 20.6 + j(0.4))}`,
    `C${pt(12.4, 13.4)} ${pt(16.6, 7.2)} ${pt(21.4 + j(0.5), 3.4 + j(0.5))}`,
  ].join(" ");
}

export function underlinePath(w: number, h: number, key: string | number): string {
  const r = seeded(key);
  const j = () => (r() * 2 - 1) * h * 0.18;
  const y = h / 2;
  return [
    `M${pt(1, y + j())}`,
    `C${pt(w * 0.2, y + j() - h * 0.3)} ${pt(w * 0.35, y + j() + h * 0.3)} ${pt(w * 0.55, y + j())}`,
    `S${pt(w * 0.85, y + j() - h * 0.2)} ${pt(w - 1, y + j())}`,
  ].join(" ");
}

export function arrowPath(w: number, h: number, key: string | number): string {
  const r = seeded(key);
  const j = () => (r() * 2 - 1) * Math.min(w, h) * 0.02;
  const neck = w * 0.58;
  const top = h * 0.3;
  const bot = h * 0.7;
  const pts: [number, number][] = [
    [w * 0.03, top],
    [neck, top],
    [neck, h * 0.06],
    [w * 0.97, h / 2],
    [neck, h * 0.94],
    [neck, bot],
    [w * 0.03, bot],
  ];
  return `${pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${pt(x + j(), y + j())}`).join(" ")} Z`;
}

/** Plain text of a React node (used to size a hand-drawn outline to its label). */
export function flatText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flatText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return flatText(node.props.children);
  return "";
}
