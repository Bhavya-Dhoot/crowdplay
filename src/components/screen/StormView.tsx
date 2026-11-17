"use client";
// STORM: the scene on top, a big countdown ring, and the desk: every idea rains onto it as a tilted paper card.
// Few ideas = big cards centred on the desk (ghost cards fill the empty slots), many ideas = smaller cards and,
// past what fits, a heap with the newest row on top. Never more than RAIN_CAP cards exist; older ones leave first.
import { useMemo } from "react";
import { BotBadge } from "@/components/ui/BotBadge";
import { Countdown } from "@/components/ui/Countdown";
import { cn } from "@/components/ui/cn";
import { AnimatePresence, m } from "@/components/ui/motion";
import { SPRING, TRANSITION } from "@/components/ui/motionTokens";
import { paperCardClass } from "@/components/ui/PaperCard";
import type { FeedIdea } from "@/lib/client/store";
import { STORM_NUDGES } from "@/lib/copy";
import type { PublicState } from "@/lib/realtime/types";
import { SCREEN_COPY } from "./copy";
import { CARD_EM, DESK_LADDER, planDesk, type DeskCard } from "./desk";
import { RAIN_CAP, usableIdeas } from "./rain";
import { useStage } from "./stage";

const HEAD_H = { full: 150, compact: 56 } as const;
/** The mini screen shows only what fits without a heap: six cards. */
const COMPACT_CAP = 6;

function IdeaCard({ card, fe, overlapPx, fresh }: { card: DeskCard; fe: number; overlapPx: number; fresh: boolean }) {
  const { px, compact } = useStage();
  return (
    <m.div
      layout="position"
      initial={{ opacity: 0, y: -px(compact ? 120 : 280), scale: 0.92, rotate: -card.tilt * 3 }}
      animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
      exit={{ opacity: 0, scale: 0.96, transition: TRANSITION.exit }}
      transition={{ ...SPRING.land, opacity: { duration: 0.15 }, layout: { type: "spring", stiffness: 260, damping: 30 } }}
      data-testid="screen-rain-item"
      className={paperCardClass({ className: "shrink-0 rounded-[0.5em] px-[0.7em] py-[0.5em]" })}
      style={{
        width: `${CARD_EM}em`,
        fontSize: `${fe}em`,
        order: card.index,
        marginTop: card.row > 0 ? -px(overlapPx) : 0,
        ["--tilt" as string]: `${card.tilt}deg`,
      }}
    >
      {fresh ? <span aria-hidden="true" className="cps-fresh" /> : null}
      <p className="leading-[1.2] font-semibold break-words text-ink">{card.text}</p>
      <p className="mt-[0.3em] flex items-center gap-[0.4em] leading-[1.3] text-ink-muted" style={{ fontSize: `max(0.7em, ${px(20)}px)` }}>
        <span className="truncate">{card.name}</span>
        {card.isBot ? <BotBadge className="border-paper-edge bg-paper-2 px-[0.35em]! text-[1.2em]! leading-[1.3]!" /> : null}
      </p>
    </m.div>
  );
}

/** A dashed slot where an idea is about to land: keeps a quiet room from looking broken. */
function GhostCard({ index, fe, text }: { index: number; fe: number; text: string }) {
  return (
    <div
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-[0.5em] border-[0.1em] border-dashed border-stage-line px-[0.7em] text-center font-script leading-[1.2] text-muted-on-stage"
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
  const areaW = metrics.w - metrics.padX * 2;
  const areaH = metrics.h - metrics.header - metrics.footer - (compact ? 8 + 6 : 26 + 6 + 14) - headH - (quiet ? (compact ? 36 : 120) : 0) - (compact ? 14 : 16);
  const plan = useMemo(
    () => planDesk(feed, { areaW, areaH, ladder: compact ? DESK_LADDER.compact : DESK_LADDER.full, gapPx: gap, cap: compact ? COMPACT_CAP : RAIN_CAP }),
    [feed, areaW, areaH, compact, gap],
  );
  const ideas = Math.max(state.stats.ideasThisRound, plan.count);
  // Newest first in the DOM (the first card is the latest idea); CSS `order` lays them out oldest first.
  const newestFirst = useMemo(() => [...plan.cards].reverse(), [plan.cards]);

  return (
    <div className="absolute inset-0 flex flex-col" style={{ paddingInline: px(metrics.padX), paddingTop: px(compact ? 0 : 6), paddingBottom: px(compact ? 8 : 26), gap: px(compact ? 6 : 14) }}>
      <div className="flex shrink-0 items-start justify-between" style={{ height: px(headH), gap: px(compact ? 12 : 40) }}>
        <div className="min-w-0">
          <h2 className={cn("line-clamp-1 font-display leading-[1.05] font-extrabold tracking-tight", compact ? "text-[1.15em]" : "text-[2.2em]")}>{state.prompt?.title}</h2>
          {state.prompt?.text && !compact ? <p className="mt-[0.35em] line-clamp-2 max-w-[44em] leading-snug text-on-stage/90">{state.prompt.text}</p> : null}
        </div>
        <div className="flex shrink-0 flex-row-reverse items-center" style={{ gap: px(compact ? 10 : 24) }}>
          <Countdown endsAt={state.phaseEndsAt} startedAt={state.phaseStartedAt} offsetMs={offsetMs} paused={state.paused} size={px(compact ? 52 : 150)} />
          <m.span
            key={ideas}
            initial={{ scale: 1.2 }}
            animate={{ scale: 1 }}
            transition={TRANSITION.fast}
            data-testid="screen-idea-count"
            className={cn("font-display font-extrabold text-on-stage tabular-nums", compact ? "text-[0.6em]" : "text-[1.5em]")}
          >
            {SCREEN_COPY.storm.ideas(ideas)}
          </m.span>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div className={cn("absolute inset-0 flex flex-col-reverse overflow-hidden", plan.overlapPx > 0 && "cps-desk")}>
          <div className="m-auto flex w-full flex-wrap content-center justify-center" style={{ gap: px(gap) }}>
            {quiet ? (
              <p
                className={cn("basis-full text-center font-display font-extrabold text-on-stage", compact ? "text-[0.95em]" : "text-[2.3em]")}
                style={{ order: -1, marginBottom: px(compact ? 4 : 10) }}
              >
                {SCREEN_COPY.storm.empty}
              </p>
            ) : null}
            <AnimatePresence initial={false}>
              {newestFirst.map((card) => (
                <IdeaCard key={card.key} card={card} fe={plan.fe} overlapPx={plan.overlapPx} fresh={card.rank === 0} />
              ))}
            </AnimatePresence>
            {Array.from({ length: plan.ghosts }, (_, i) => (
              <GhostCard key={`ghost-${i}`} index={i} fe={plan.fe} text={quiet ? (STORM_NUDGES[i] ?? SCREEN_COPY.storm.ghost) : SCREEN_COPY.storm.ghost} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
