// Share card for /story/[showId]: 1200x630, the playbill from the story page in miniature: a paper sheet on the stage
// with the story title, tagline, scene count and a CANON stamp. Never throws: a missing show, a database hiccup or an
// empty recap still returns a valid card.
// Satori ships one regular-weight font, so headline weight is built with a text stroke; no emoji and no network fonts
// (Satori would fetch them), so the letters and the stamp are drawn with plain boxes and text.
import { ImageResponse } from "next/og";
import { storyBlurb, storyHeading } from "@/components/depth/storyState";
import { log } from "@/lib/log";
import { loadStory } from "@/lib/metrics";

export const dynamic = "force-dynamic";
export const alt = "A story written live by the crowd on CrowdPlay";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The v2 tokens (src/styles/tokens.css) as literals: Satori has no CSS variables.
const C = {
  stage: "#0F0D16",
  paper: "#F6F0E4",
  paperEdge: "#D9CDB6",
  ink: "#1C1828",
  inkMuted: "#5E566F",
  gold: "#FFC83D",
  amber: "#FFB547",
  a: "#4C7DFF",
  b: "#22C58B",
  c: "#FF3D7F",
};

type Card = { title: string; tagline: string; rounds: number; demo: boolean };

const FALLBACK: Card = { title: "CrowdPlay", tagline: "Everyone types, AI finds three choices, the room decides.", rounds: 0, demo: false };

const clip = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

async function cardFor(showId: string): Promise<Card> {
  try {
    const story = await loadStory(showId);
    if (!story) return FALLBACK;
    return {
      title: clip(storyHeading(story.show), 90),
      tagline: clip(story.show.tagline?.trim() || storyBlurb(story.show), 120),
      rounds: story.rounds.length,
      demo: story.show.isDemo,
    };
  } catch (err) {
    log.warn({ err, showId }, "share image: story unavailable, using the generic card");
    return FALLBACK;
  }
}

/** Bigger type for short titles, smaller for long ones, so three lines always fit on the sheet. */
const titleSize = (title: string): number => (title.length <= 18 ? 108 : title.length <= 30 ? 90 : title.length <= 46 ? 74 : title.length <= 70 ? 62 : 52);

const bold = (px: number, color: string) => ({ WebkitTextStroke: `${px}px ${color}` });

function Disc({ letter, color, light }: { letter: string; color: string; light?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 52,
        height: 52,
        borderRadius: 26,
        marginRight: 10,
        background: color,
        color: light ? "#FFFFFF" : C.ink,
        fontSize: 28,
        ...bold(1.4, light ? "#FFFFFF" : C.ink),
      }}
    >
      {letter}
    </div>
  );
}

export default async function Image({ params }: { params?: Promise<{ showId: string }> }) {
  const showId = params ? (await params).showId : "";
  const card = await cardFor(showId);
  const tSize = titleSize(card.title);
  const scenes = card.rounds > 0 ? `${card.rounds} ${card.rounds === 1 ? "scene" : "scenes"}, written live by the crowd` : "Written live by the crowd";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: C.stage,
          backgroundImage: "radial-gradient(ellipse at 50% -8%, rgba(255,181,71,0.30), rgba(255,181,71,0) 62%)",
        }}
      >
        {/* the sheet: a paper page lifted off the stage, a hair off square */}
        <div
          style={{
            display: "flex",
            position: "relative",
            width: 1096,
            height: 566,
            background: C.paper,
            borderRadius: 20,
            boxShadow: `0 2px 0 ${C.paperEdge}, 0 30px 44px -20px rgba(0,0,0,0.75)`,
            transform: "rotate(-1deg)",
          }}
        >
          {/* the printed keyline */}
          <div
            style={{
              display: "flex",
              position: "absolute",
              left: 14,
              top: 14,
              right: 14,
              bottom: 14,
              border: `2px solid ${C.paperEdge}`,
              borderRadius: 10,
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "center", width: "100%", height: "100%", padding: "46px 64px 42px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative", width: "100%" }}>
              <div style={{ display: "flex", fontSize: 28, color: C.inkMuted }}>{card.title === FALLBACK.title ? "The audience writes the show" : "CrowdPlay presents"}</div>
              {card.demo ? (
                <div
                  style={{
                    display: "flex",
                    position: "absolute",
                    right: 0,
                    top: -6,
                    padding: "8px 18px",
                    borderRadius: 8,
                    background: C.c,
                    color: C.ink,
                    fontSize: 24,
                    letterSpacing: 4,
                    transform: "rotate(-4deg)",
                    ...bold(0.8, C.ink),
                  }}
                >
                  DEMO SHOW
                </div>
              ) : null}
            </div>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", maxWidth: 960 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  textAlign: "center",
                  fontSize: tSize,
                  lineHeight: 1.02,
                  letterSpacing: -3,
                  color: C.ink,
                  ...bold(tSize > 90 ? 3.2 : 2.4, C.ink),
                }}
              >
                {card.title}
              </div>
              <div style={{ display: "flex", justifyContent: "center", textAlign: "center", marginTop: 20, fontSize: 32, lineHeight: 1.3, color: C.inkMuted, maxWidth: 900 }}>
                {card.tagline}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
              <div style={{ display: "flex", width: 210 }}>
                <Disc letter="A" color={C.a} light />
                <Disc letter="B" color={C.b} />
                <Disc letter="C" color={C.c} light />
              </div>
              <div style={{ display: "flex", fontSize: 26, color: C.inkMuted }}>{scenes}</div>
              <div style={{ display: "flex", width: 210, justifyContent: "flex-end" }}>
                <div
                  style={{
                    display: "flex",
                    padding: "5px",
                    borderRadius: 8,
                    background: C.gold,
                    transform: "rotate(-4deg)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      padding: "8px 20px",
                      borderRadius: 5,
                      border: `2px solid ${C.ink}`,
                      color: C.ink,
                      fontSize: 30,
                      letterSpacing: 7,
                      ...bold(1, C.ink),
                    }}
                  >
                    CANON
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
