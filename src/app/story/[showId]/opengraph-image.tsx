// Share card for /story/[showId]: 1200x630, story title + tagline + round count + the CROWDPLAY wordmark.
// Never throws: a missing show, a database hiccup or an empty recap still returns a valid card.
// Satori ships one regular-weight font, so headline weight is built with a text stroke; no emoji (Satori would fetch them).
import { ImageResponse } from "next/og";
import { storyBlurb, storyHeading } from "@/components/depth/storyState";
import { log } from "@/lib/log";
import { loadStory } from "@/lib/metrics";

export const dynamic = "force-dynamic";
export const alt = "A story written live by the crowd on CrowdPlay";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const COLORS = { bg: "#0B0B12", surface: "#15151F", line: "#2A2A3A", text: "#F5F5FA", muted: "#9A9AB0", accent: "#FFD23F", a: "#5B8CFF", b: "#3DDC97", c: "#FF4D8D" };

type Card = { title: string; tagline: string; rounds: number; demo: boolean };

const FALLBACK: Card = { title: "CrowdPlay", tagline: "The audience writes the show.", rounds: 0, demo: false };

const clip = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

async function cardFor(showId: string): Promise<Card> {
  try {
    const story = await loadStory(showId);
    if (!story) return FALLBACK;
    return {
      title: clip(storyHeading(story.show), 90),
      tagline: clip(story.show.tagline?.trim() || storyBlurb(story.show), 130),
      rounds: story.rounds.length,
      demo: story.show.isDemo,
    };
  } catch (err) {
    log.warn({ err, showId }, "share image: story unavailable, using the generic card");
    return FALLBACK;
  }
}

/** Bigger type for short titles, smaller for long ones, so three lines always fit. */
const titleSize = (title: string): number => (title.length <= 22 ? 112 : title.length <= 40 ? 92 : title.length <= 64 ? 76 : 62);

const bold = (px: number, color: string) => ({ WebkitTextStroke: `${px}px ${color}` });

function Dot({ letter, color }: { letter: string; color: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 52,
        height: 52,
        borderRadius: 26,
        background: color,
        color: COLORS.bg,
        fontSize: 28,
        ...bold(1.5, COLORS.bg),
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
  const roundsText = card.rounds > 0 ? `${card.rounds} ${card.rounds === 1 ? "round" : "rounds"} written by the crowd` : "Written by the crowd";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          background: COLORS.bg,
          backgroundImage:
            "radial-gradient(circle at 88% 0%, rgba(255,210,63,0.24), rgba(255,210,63,0) 52%), radial-gradient(circle at 0% 100%, rgba(255,77,141,0.16), rgba(255,77,141,0) 48%)",
          color: COLORS.text,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", position: "relative", width: 56, height: 56, marginRight: 20 }}>
              <div style={{ position: "absolute", left: 0, top: 4, width: 30, height: 30, borderRadius: 15, background: COLORS.a }} />
              <div style={{ position: "absolute", left: 26, top: 4, width: 30, height: 30, borderRadius: 15, background: COLORS.b }} />
              <div style={{ position: "absolute", left: 13, top: 26, width: 30, height: 30, borderRadius: 15, background: COLORS.c }} />
            </div>
            <div style={{ display: "flex", fontSize: 38, letterSpacing: 8, ...bold(1.4, COLORS.text) }}>CROWDPLAY</div>
          </div>
          {card.demo ? (
            <div
              style={{
                display: "flex",
                padding: "10px 22px",
                borderRadius: 999,
                border: `2px solid ${COLORS.c}`,
                color: COLORS.c,
                fontSize: 26,
              }}
            >
              Demo show, simulated players
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: tSize,
              lineHeight: 1.02,
              letterSpacing: -3,
              color: COLORS.text,
              ...bold(tSize > 90 ? 3.2 : 2.4, COLORS.text),
            }}
          >
            {card.title}
          </div>
          <div style={{ display: "flex", marginTop: 26, fontSize: 38, lineHeight: 1.25, color: COLORS.muted, maxWidth: 1000 }}>{card.tagline}</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div
            style={{
              display: "flex",
              padding: "14px 28px",
              borderRadius: 999,
              border: `2px solid ${COLORS.accent}`,
              color: COLORS.accent,
              fontSize: 30,
            }}
          >
            {roundsText}
          </div>
          <div style={{ display: "flex" }}>
            <div style={{ display: "flex", marginRight: 12 }}>
              <Dot letter="A" color={COLORS.a} />
            </div>
            <div style={{ display: "flex", marginRight: 12 }}>
              <Dot letter="B" color={COLORS.b} />
            </div>
            <div style={{ display: "flex" }}>
              <Dot letter="C" color={COLORS.c} />
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
