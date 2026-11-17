// FatArrow: the poster's "->": a yellow-filled, ink-outlined arrow with a grey marker shadow. Structural yellow
// (like the numbered banners): use it to join boxes, steps and scenes. Server-safe, drawn on mount.
//   <FatArrow />                             48 px long, points right; the outline is drawn, then the marker fills it
//   <FatArrow direction="down" size={40} delayMs={600} seed="step-1" />
//   <FatArrow play={false} />                static, complete
// `size` is the length along its direction. The box it takes is the arrow's own size (rotated for up/down).
import type { CSSProperties } from "react";
import { cn } from "./cn";
import { arrowPath } from "./doodle";
import { DRAW_MS } from "./motionTokens";

type Direction = "right" | "down" | "left" | "up";
type Props = { direction?: Direction; size?: number; play?: boolean; delayMs?: number; seed?: string | number; className?: string };

const ROTATE: Record<Direction, number> = { right: 0, down: 90, left: 180, up: 270 };
const W = 64;
const H = 36;

export function FatArrow({ direction = "right", size = 48, play = true, delayMs = 0, seed = "arrow", className }: Props) {
  const long = size;
  const short = Math.round((size * H) / W);
  const vertical = direction === "down" || direction === "up";
  const d = arrowPath(W, H, seed);
  const style = { "--draw-ms": `${DRAW_MS.outline}ms`, "--draw-delay": `${delayMs}ms` } as CSSProperties;
  const fillStyle = { "--fill-ms": "175ms", "--draw-delay": `${delayMs + DRAW_MS.outline - 120}ms` } as CSSProperties;
  return (
    <span
      aria-hidden="true"
      className={cn("fat-arrow", className)}
      style={{ width: vertical ? short : long, height: vertical ? long : short }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={long}
        height={short}
        className="max-w-none overflow-visible"
        style={{ rotate: `${ROTATE[direction]}deg` }}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <path d={d} transform="translate(2.5 3)" fill="var(--marker-2)" className="draw-fill" data-play={play} style={fillStyle} />
        <path d={d} fill="var(--hl-solid)" className="draw-fill" data-play={play} style={fillStyle} />
        <path d={d} pathLength="1" fill="none" stroke="var(--ink)" strokeWidth={2.6} className="draw" data-play={play} style={style} />
      </svg>
    </span>
  );
}
