// Share card for /story/[showId]: 1200x630, the sketchnote poster from the story page in miniature, on dot-grid paper: the
// title on a banner with a yellow swash on its last word, the tagline, up to three numbered scene boxes joined by yellow fat
// arrows (the prompt and the winning line, with the CANON ribbon only on canon), and a dashed footer line. Never throws: a
// missing show, a database hiccup, a missing font or an empty recap still returns a valid card.
// Satori (next/og) cannot read next/font, and a network font would be fetched on every share, so the hand lettering is the
// self-hosted Patrick Hand (SIL OFL, src/components/depth/fonts) read from disk; if that file is missing the card falls back
// to the default sans and still reads as a sketchnote (ink outlines, yellow ribbon, dot grid). Kalam is not on disk, so
// headings are Patrick Hand with a text stroke for weight. No emoji: letters and ribbons are plain boxes and text.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { storyBlurb, storyHeading } from "@/components/depth/storyState";
import { loadWinnerSlots } from "@/components/depth/winnerSlots";
import { arrowPath } from "@/components/ui/doodle";
import { log } from "@/lib/log";
import { loadStory } from "@/lib/metrics";

export const dynamic = "force-dynamic";
export const alt = "A story written live by the crowd on CrowdPlay";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The v3 tokens (src/styles/tokens.css) as literals: Satori has no CSS variables.
const C = {
  paper: "#FBFAF6",
  raised: "#FFFEFA",
  dots: "#D9D4C9",
  ink: "#1E1E22",
  notes: "#5B5852",
  faint: "#8A867D",
  marker2: "rgba(80,80,92,0.28)",
  hl: "rgba(255,205,40,0.85)",
  hlSolid: "#FFD23F",
};

type Scene = { n: number; title: string; line: string; kind: string; slot: string | null };
type Card = { title: string; tagline: string; rounds: number; demo: boolean; scenes: Scene[] };

const FALLBACK: Card = { title: "CrowdPlay", tagline: "Everyone types, AI finds three choices, the room decides.", rounds: 0, demo: false, scenes: [] };

const clip = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

async function cardFor(showId: string): Promise<Card> {
  try {
    const story = await loadStory(showId);
    if (!story) return FALLBACK;
    const slots = await loadWinnerSlots(showId);
    return {
      title: clip(storyHeading(story.show), 70),
      tagline: clip(story.show.tagline?.trim() || storyBlurb(story.show), 110),
      rounds: story.rounds.length,
      demo: story.show.isDemo,
      scenes: story.rounds.slice(0, 3).map((r) => ({
        n: r.roundNo,
        title: clip(r.prompt.title, 34),
        line: r.winner ? clip(r.winner.label, 42) : "",
        kind: r.winner?.kind ?? "narrator",
        slot: slots.get(r.roundNo) ?? null,
      })),
    };
  } catch (err) {
    log.warn({ err, showId }, "share image: story unavailable, using the generic card");
    return FALLBACK;
  }
}

async function loadFont(): Promise<{ name: string; data: Buffer; weight: 400; style: "normal" }[]> {
  try {
    const data = await readFile(path.join(process.cwd(), "src", "components", "depth", "fonts", "PatrickHand-Regular.ttf"));
    return [{ name: "Patrick", data, weight: 400, style: "normal" }];
  } catch (err) {
    log.warn({ err }, "share image: hand-lettering font not found, using the default font");
    return [];
  }
}

/** Bigger type for short titles, smaller for long ones, so the banner never grows past two lines. */
const titleSize = (title: string): number => (title.length <= 14 ? 92 : title.length <= 24 ? 74 : title.length <= 40 ? 60 : 48);

const flex = { display: "flex" } as const;
const stroke = (px: number, color: string) => ({ WebkitTextStroke: `${px}px ${color}` });

// A notched ribbon tail (same drawing as <Banner>): the inner edge is tucked against the face, the outer edge has a V cut in it.
function Tail({ side, h }: { side: "l" | "r"; h: number }) {
  return (
    <svg width={44} height={h} viewBox="0 0 30 40" preserveAspectRatio="none" style={{ marginTop: 14, ...(side === "r" ? { transform: "scaleX(-1)" } : {}) }}>
      <path d="M30 3 H3 L11 20 L3 37 H30 Z" fill={C.marker2} stroke={C.ink} strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

function FatArrow() {
  const d = arrowPath(64, 36, "og-arrow");
  return (
    <svg width={60} height={34} viewBox="-2 -2 70 42" style={{ flexShrink: 0 }}>
      <path d={d} transform="translate(2.5 3)" fill={C.marker2} />
      <path d={d} fill={C.hlSolid} stroke={C.ink} strokeWidth={2.6} strokeLinejoin="round" />
    </svg>
  );
}

// The page's dot grid (the CSS radial-gradient version does not render in Satori; an SVG pattern does).
function DotGrid() {
  return (
    <svg width={size.width} height={size.height} style={{ position: "absolute", left: 0, top: 0 }}>
      <defs>
        <pattern id="dots" width="38" height="38" patternUnits="userSpaceOnUse">
          <circle cx="19" cy="19" r="2.2" fill={C.dots} />
        </pattern>
      </defs>
      <rect width={size.width} height={size.height} fill="url(#dots)" />
    </svg>
  );
}

const RIBBON: Record<string, { text: string; bg: string; dashed: boolean }> = {
  crowd: { text: "CANON", bg: C.hlSolid, dashed: false },
  wildcard: { text: "WILDCARD", bg: C.raised, dashed: true },
  narrator: { text: "NARRATOR", bg: C.raised, dashed: false },
};

function SceneBox({ s }: { s: Scene }) {
  const ribbon = RIBBON[s.kind] ?? RIBBON.crowd;
  return (
    <div
      style={{
        ...flex,
        position: "relative",
        flexDirection: "column",
        width: 304,
        minHeight: 178,
        padding: "32px 20px 16px",
        background: C.raised,
        border: `4px solid ${C.ink}`,
        borderRadius: 20,
        boxShadow: `7px 8px 0 ${C.marker2}`,
      }}
    >
      <div
        style={{
          ...flex,
          position: "absolute",
          top: -22,
          left: 18,
          padding: "3px 16px 1px",
          background: C.hlSolid,
          border: `3px solid ${C.ink}`,
          fontSize: 24,
          letterSpacing: 2,
          color: C.ink,
          transform: "rotate(-2deg)",
          ...stroke(0.6, C.ink),
        }}
      >
        {`SCENE ${s.n}`}
      </div>
      {s.line ? (
        <div
          style={{
            ...flex,
            position: "absolute",
            top: -16,
            right: 14,
            padding: "2px 12px 0",
            background: ribbon.bg,
            border: `3px ${ribbon.dashed ? "dashed" : "solid"} ${C.ink}`,
            fontSize: 20,
            letterSpacing: 2,
            color: C.ink,
            transform: "rotate(2deg)",
            ...stroke(0.5, C.ink),
          }}
        >
          {ribbon.text}
        </div>
      ) : null}
      <div style={{ ...flex, fontSize: 33, lineHeight: 1.1, color: C.ink, ...stroke(0.9, C.ink) }}>{s.title}</div>
      {s.line ? (
        <div style={{ ...flex, alignItems: "center", marginTop: 10 }}>
          {s.slot ? (
            <div
              style={{
                ...flex,
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                marginRight: 10,
                borderRadius: 18,
                border: `3px solid ${C.ink}`,
                background: C.paper,
                color: C.ink,
                fontSize: 22,
                ...stroke(0.6, C.ink),
              }}
            >
              {s.slot}
            </div>
          ) : null}
          <div style={{ ...flex, flex: 1, fontSize: 25, lineHeight: 1.15, color: C.notes }}>{s.line}</div>
        </div>
      ) : null}
    </div>
  );
}

export default async function Image({ params }: { params?: Promise<{ showId: string }> }) {
  const showId = params ? (await params).showId : "";
  const [card, fonts] = await Promise.all([cardFor(showId), loadFont()]);
  const tSize = titleSize(card.title);
  const words = card.title.split(/\s+/).filter(Boolean);
  const last = words.pop() ?? card.title;
  const hasScenes = card.scenes.length > 0;
  const scenesNote = card.rounds > 0 ? `${card.rounds} ${card.rounds === 1 ? "scene" : "scenes"}, written live by the crowd` : "Written live by the crowd";

  return new ImageResponse(
    (
      <div
        style={{
          ...flex,
          position: "relative",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          padding: "34px 56px 26px",
          backgroundColor: C.paper,
          color: C.ink,
          ...(fonts.length ? { fontFamily: "Patrick" } : {}),
        }}
      >
        <DotGrid />
        <div style={{ ...flex, flex: 1, flexDirection: "column", alignItems: "center", justifyContent: hasScenes ? "flex-start" : "center" }}>
          {/* the title banner */}
          <div style={{ ...flex, alignItems: "stretch", justifyContent: "center", maxWidth: 1090 }}>
            <Tail side="l" h={Math.round(tSize * 1.1 + 40)} />
            <div
              style={{
                ...flex,
                flexWrap: "wrap",
                justifyContent: "center",
                alignItems: "center",
                maxWidth: 940,
                padding: "16px 36px 12px",
                background: C.raised,
                border: `5px solid ${C.ink}`,
                borderRadius: 6,
                boxShadow: `6px 7px 0 ${C.marker2}`,
                fontSize: tSize,
                lineHeight: 1.08,
                letterSpacing: 2,
                textTransform: "uppercase",
                textAlign: "center",
                ...stroke(tSize > 70 ? 2.2 : 1.6, C.ink),
              }}
            >
              {words.map((w, i) => (
                <div key={i} style={{ ...flex, flexShrink: 0, whiteSpace: "nowrap", marginRight: tSize * 0.28 }}>
                  {w}
                </div>
              ))}
              <div style={{ ...flex, flexShrink: 0, whiteSpace: "nowrap", padding: "0 12px", background: C.hl, borderRadius: 16, transform: "rotate(-1deg)" }}>{last}</div>
            </div>
            <Tail side="r" h={Math.round(tSize * 1.1 + 40)} />
          </div>

          <div style={{ ...flex, justifyContent: "center", textAlign: "center", marginTop: 24, maxWidth: 940, fontSize: hasScenes ? 31 : 36, lineHeight: 1.25, color: C.notes }}>{card.tagline}</div>

          {hasScenes ? (
            <div style={{ ...flex, alignItems: "stretch", justifyContent: "center", marginTop: 56 }}>
              {card.scenes.map((s, i) => (
                <div key={s.n} style={{ ...flex, alignItems: "stretch" }}>
                  {i > 0 ? (
                    <div style={{ ...flex, alignSelf: "center", margin: "0 14px" }}>
                      <FatArrow />
                    </div>
                  ) : null}
                  <SceneBox s={s} />
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div style={{ ...flex, alignItems: "baseline", justifyContent: "space-between", paddingTop: 10, borderTop: `3px dashed ${C.faint}`, fontSize: 25, color: C.notes }}>
          <div style={{ ...flex, alignItems: "center" }}>
            <div style={{ ...flex, color: C.ink, ...stroke(0.7, C.ink) }}>CrowdPlay</div>
            {card.demo ? (
              <div style={{ ...flex, alignItems: "center", marginLeft: 22 }}>
                <div style={{ ...flex, padding: "2px 14px 0", background: C.raised, border: `3px solid ${C.ink}`, fontSize: 22, letterSpacing: 3, color: C.ink, transform: "rotate(-2deg)", ...stroke(0.5, C.ink) }}>DEMO</div>
                <div style={{ ...flex, marginLeft: 12 }}>Simulated players</div>
              </div>
            ) : null}
          </div>
          <div style={{ ...flex }}>{scenesNote}</div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
