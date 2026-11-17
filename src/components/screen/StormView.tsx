"use client";
// STORM: "2 Ideas" on its numbered banner, the scene on a note beside it, the count and the countdown. Below, the page
// fills up with notes: every idea is placed on the dot grid as a pinned paper note with its own seeded tilt (a bot's
// note carries the 🤖 badge). Few ideas = big notes centred on the page (dashed empty slots fill the quiet), many ideas =
// smaller notes and, past what fits, a heap with the newest row on top. Never more than RAIN_CAP notes exist; older
// ones leave first.
import { useMemo } from "react";
import { NumberBanner } from "@/components/ui/Banner";
import { BotBadge } from "@/components/ui/BotBadge";
import { Countdown } from "@/components/ui/Countdown";
import { cn } from "@/components/ui/cn";
import { m } from "@/components/ui/motion";
import { TRANSITION } from "@/components/ui/motionTokens";
import type { FeedIdea } from "@/lib/client/store";
import { STORM_NUDGES } from "@/lib/copy";
import type { PublicState } from "@/lib/realtime/types";
import { SCREEN_COPY } from "./copy";
import { CARD_EM, DESK_LADDER, planDesk, type DeskCard } from "./desk";
import { RAIN_CAP, unit, usableIdeas } from "./rain";
import { bannerStyle, tiltStyle, useStage } from "./stage";

const HEAD_H = { full: 136, compact: 52 } as const;
/** The mini screen shows only what fits without a heap: six notes of at most three lines. */
const COMPACT_CAP = 6;
const COMPACT_LINES = 3;
/** Room kept around the desk for a note's pin and marker shadow, in canvas px. */
const EDGE = 12;

function IdeaNote({ card, fe, overlapPx }: { card: DeskCard; fe: number; overlapPx: number }) {
  const { px, compact } = useStage();
  // A hand-pinned note sits a hair off its row: a seeded nudge, never random per render.
  const nudge = Math.round((unit(card.key, "jy") - 0.5) * 24) / 100;
  return (
    <m.div
      // The mini screen never glides: its six notes simply change.
      layout={compact ? false : "position"}
      initial={{ opacity: 0, y: px(6), rotate: 1.5 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ ...TRANSITION.medium, layout: { type: "spring", stiffness: 260, damping: 30 } }}
      data-testid="screen-rain-item"
      className={cn("cps-note shrink-0 px-[0.7em] py-[0.5em]", overlapPx === 0 && "cps-pin", card.index % 2 === 1 && "cps-note-alt")}
      style={{
        width: `${CARD_EM}em`,
        fontSize: `${fe}em`,
        order: card.index,
        zIndex: card.index,
        marginTop: card.row > 0 ? -px(overlapPx) : 0,
        translate: `0 ${nudge}em`,
        ...tiltStyle(card.tilt),
      }}
    >
      <p className={cn("leading-[1.2] break-words text-ink", compact && "line-clamp-3")}>{card.text}</p>
      <p className="mt-[0.3em] flex items-center gap-[0.4em] leading-[1.3] text-ink-notes" style={{ fontSize: `max(0.7em, ${px(compact ? 13 : 20)}px)` }}>
        <span className="truncate">{card.name}</span>
        {card.isBot ? <BotBadge className="px-[0.35em]! text-[1.1em]! leading-[1.3]!" /> : null}
      </p>
    </m.div>
  );
}

/** A dashed slot where an idea is about to land: keeps a quiet room from looking broken. */
function GhostNote({ index, fe, text }: { index: number; fe: number; text: string }) {
  return (
    <div
      aria-hidden="true"
      className="cps-ghost grid shrink-0 place-items-center px-[0.7em] text-center leading-[1.2]"
      style={{ width: `${CARD_EM}em`, minHeight: "4.6em", fontSize: `${fe}em`, order: 1000 + index }}
    >
      {text}
    </div>
  );
}

export function StormView({ state, feed }: { state: PublicState; feed: FeedIdea[] }) {
  const { compact, offsetMs, metrics, px } = useStage();
  const gap = compact ? 10 : 24;
  const headH = compact ? HEAD_H.compact : HEAD_H.full;
  const quiet = usableIdeas(feed).length === 0;
  const padTop = compact ? 0 : 6;
  const padBottom = compact ? 8 : 26;
  const rowGap = compact ? 6 : 14;
  const areaW = metrics.w - metrics.padX * 2 - EDGE * 2;
  const areaH = metrics.h - metrics.header - metrics.footer - padTop - padBottom - rowGap - headH - EDGE * 2 - (quiet ? (compact ? 36 : 130) : 0) - (compact ? 6 : 20);
  const plan = useMemo(
    () => planDesk(feed, { areaW, areaH, ladder: compact ? DESK_LADDER.compact : DESK_LADDER.full, gapPx: gap, cap: compact ? COMPACT_CAP : RAIN_CAP, maxLines: compact ? COMPACT_LINES : undefined }),
    [feed, areaW, areaH, compact, gap],
  );
  const ideas = Math.max(state.stats.ideasThisRound, plan.count);
  // Newest first in the DOM (the first note is the latest idea); CSS `order` lays them out oldest first.
  const newestFirst = useMemo(() => [...plan.cards].reverse(), [plan.cards]);

  return (
    <div className="absolute inset-0 flex flex-col" style={{ paddingInline: px(metrics.padX), paddingTop: px(padTop), paddingBottom: px(padBottom), gap: px(rowGap) }}>
      <div className="flex shrink-0 items-center" style={{ height: px(headH), gap: px(compact ? 10 : 36), paddingBlock: px(compact ? 4 : 10), paddingTop: px(compact ? 10 : 10) }}>
        <h2 className="m-0 shrink-0 leading-none">
          <NumberBanner n={state.roundNo} label={SCREEN_COPY.storm.banner} play style={bannerStyle(px(compact ? 20 : 40))} />
        </h2>
        <div style={tiltStyle(-0.5)} className={cn("cps-slip cps-tape min-w-0 flex-1", compact ? "px-[0.7em] py-[0.3em]" : "px-[0.9em] py-[0.45em]")}>
          <p className={cn("line-clamp-1 font-display leading-[1.15]", compact ? "text-[0.85em]" : "text-[1.15em]")}>{state.prompt?.title}</p>
          {state.prompt?.text && !compact ? <p className="mt-[0.15em] line-clamp-2 text-[0.8em] leading-[1.25] text-ink-notes">{state.prompt.text}</p> : null}
        </div>
        <div className="flex shrink-0 items-center" style={{ gap: px(compact ? 8 : 20) }}>
          <p
            key={ideas}
            data-testid="screen-idea-count"
            style={tiltStyle(0.6)}
            className={cn("placed cps-slip font-display leading-none tabular-nums", compact ? "px-[0.6em] py-[0.35em] text-[0.7em]" : "px-[0.8em] py-[0.4em] text-[1.4em]")}
          >
            {SCREEN_COPY.storm.ideas(ideas)}
          </p>
          <div className="cps-disc" style={{ padding: px(compact ? 2 : 6) }}>
            <Countdown endsAt={state.phaseEndsAt} startedAt={state.phaseStartedAt} offsetMs={offsetMs} paused={state.paused} size={px(compact ? 46 : 112)} />
          </div>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div className={cn("absolute inset-0 flex flex-col-reverse overflow-hidden", plan.overlapPx > 0 && "cps-desk")} style={{ padding: px(EDGE) }}>
          <div className="m-auto flex w-full flex-wrap content-center justify-center" style={{ gap: px(gap) }}>
            {quiet ? (
              <div className="flex basis-full justify-center" style={{ order: -1, marginBottom: px(compact ? 4 : 10) }}>
                <p
                  style={tiltStyle(-0.8)}
                  className={cn("cps-slip cps-tape text-center font-display leading-[1.1]", compact ? "px-[0.8em] py-[0.3em] text-[0.95em]" : "px-[1em] py-[0.35em] text-[2em]")}
                >
                  {SCREEN_COPY.storm.empty}
                </p>
              </div>
            ) : null}
            {/* A note that leaves is gone at once: one that lingered while fading would take a row of its own and push the top row up. */}
            {newestFirst.map((card) => (
              <IdeaNote key={card.key} card={card} fe={plan.fe} overlapPx={plan.overlapPx} />
            ))}
            {Array.from({ length: plan.ghosts }, (_, i) => (
              <GhostNote key={`ghost-${i}`} index={i} fe={plan.fe} text={quiet ? (STORM_NUDGES[i] ?? SCREEN_COPY.storm.ghost) : SCREEN_COPY.storm.ghost} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
