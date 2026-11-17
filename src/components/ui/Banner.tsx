// Banner / NumberBanner: the sketchnote ribbon. A face with a hand-drawn ink outline and two grey-marker tails with
// notched ends (the poster's "1 SIP" banners). Server-safe; the outline is one seeded stroke, so server and browser agree.
//   <Banner size="xl">CrowdPlay</Banner>                          a title banner: paper face
//   <Banner tone="yellow" play>Canon</Banner>                       yellow face; play = outline drawn, then the word written
//   <NumberBanner n={2} label="Vote" />                            "2 VOTE": the numbered banner for phases and sections
// tone: paper (default) | yellow. Yellow is structural here (numbered banners, the canon ribbon): use it sparingly.
// size: sm 15 | md 18 | lg 28 | xl 48 px type. For other sizes set the type size with className="[--b-px:36]" (a number).
// dashed = dashed outline (wildcard-style labels). play = draw on mount (outline 400 ms, then the fill and the word);
// reduced motion shows it complete. delayMs offsets that. boil = the optional ink wobble (REVEAL only).
// Margins: the banner keeps 0.95em on each side for its tails, so absolutely positioned ones (right-3) include them.
import type { CSSProperties, ReactNode } from "react";
import { cn } from "./cn";
import { boxPath, flatText } from "./doodle";
import { DRAW_MS } from "./motionTokens";

export type BannerSize = "sm" | "md" | "lg" | "xl";

type BannerProps = {
  children: ReactNode;
  tone?: "paper" | "yellow";
  size?: BannerSize;
  dashed?: boolean;
  play?: boolean;
  delayMs?: number;
  boil?: boolean;
  seed?: string | number;
  className?: string;
  style?: CSSProperties;
};

// A notched tail: the inner edge is tucked behind the face, the outer edge has a V cut into it.
const TAIL = "M30 3 H3 L11 20 L3 37 H30 Z";

function Tail({ side }: { side: "l" | "r" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 30 40" preserveAspectRatio="none" className={cn("banner-tail", side === "l" ? "banner-tail-l" : "banner-tail-r")}>
      <path d={TAIL} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Banner({ children, tone = "paper", size = "md", dashed = false, play = false, delayMs = 0, boil = false, seed, className, style }: BannerProps) {
  const text = flatText(children);
  // The outline is drawn in tenths of an em, so a label's length gives it a close-enough shape (it stretches to fit).
  const W = Math.round((text.length * 0.7 + 1.9) * 10);
  const H = 17;
  const vars = {
    "--draw-ms": `${DRAW_MS.outline}ms`,
    "--draw-delay": `${delayMs}ms`,
    "--banner-fill-delay": `${delayMs + 380}ms`,
    "--banner-word-delay": `${delayMs + 420}ms`,
    ...style,
  } as CSSProperties;
  // While it is being written the word is spelled out letter by letter; screen readers get the whole word at once.
  const word =
    play && text && text === children ? (
      <>
        <span className="sr-only">{text}</span>
        <span aria-hidden="true">
          {Array.from(text).map((ch, i) => (
            <span key={i} className="banner-letter" style={{ "--i": i } as CSSProperties}>
              {ch}
            </span>
          ))}
        </span>
      </>
    ) : (
      children
    );
  return (
    <span
      className={cn("banner", `banner-${size}`, tone === "yellow" && "banner-yellow", dashed && "banner-dashed", boil && "ink-boil", className)}
      data-play={play}
      style={vars}
    >
      <Tail side="l" />
      <span className="banner-face">
        {word}
        <svg aria-hidden="true" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="banner-line">
          <path d={boxPath(W, H, seed ?? `banner-${text}`)} pathLength="1" className="draw" data-play={play} />
        </svg>
      </span>
      <Tail side="r" />
    </span>
  );
}

type NumberBannerProps = Omit<BannerProps, "children" | "tone"> & { n: number | string; label: string };

/** "1 IDEAS": the numbered banner for a phase or a section head. */
export function NumberBanner({ n, label, ...rest }: NumberBannerProps) {
  return (
    <Banner tone="yellow" {...rest} className={cn("banner-n", rest.className)} seed={rest.seed ?? `nb-${n}-${label}`}>
      <span className="banner-num">{n}</span>
      {label}
    </Banner>
  );
}
