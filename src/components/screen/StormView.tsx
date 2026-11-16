"use client";
// STORM: the prompt on top, a big countdown ring, and the idea "rain": every idea lands as a card at
// the top of its column and sinks as newer ones arrive. Never more than RAIN_CAP cards exist (older
// ones are dropped from the DOM; by then they are faded out and under the column's fade mask).
import { useMemo } from "react";
import { BotBadge } from "@/components/ui/BotBadge";
import { Countdown } from "@/components/ui/Countdown";
import { cn } from "@/components/ui/cn";
import { m } from "@/components/ui/motion";
import type { FeedIdea } from "@/lib/client/store";
import { STORM_NUDGES } from "@/lib/copy";
import type { PublicState } from "@/lib/realtime/types";
import { SCREEN_COPY } from "./copy";
import { planRain, rainOpacity, RAIN_CAP, type RainCard } from "./rain";
import { useStage } from "./stage";

function RainItem({ card, compact }: { card: RainCard; compact: boolean }) {
  return (
    <m.div
      layout="position"
      initial={{ opacity: 0, y: -90, scale: 0.8, rotate: card.tilt * 5 }}
      animate={{ opacity: rainOpacity(card.rank), y: 0, scale: 1, rotate: card.tilt }}
      transition={{ type: "spring", stiffness: 340, damping: 24, mass: 0.8, layout: { type: "spring", stiffness: 260, damping: 30 } }}
      data-testid="screen-rain-item"
      className={cn(
        "shrink-0 rounded-[0.5em] border border-line bg-surface-2/95 shadow-[0_10px_24px_-14px_rgb(0_0_0/0.8)]",
        compact ? "px-[0.55em] py-[0.4em]" : "px-[0.7em] py-[0.5em]",
        card.rank === 0 && "cps-new",
      )}
    >
      <p className={cn("leading-[1.18] font-semibold break-words text-text", compact ? "text-[0.72em]" : "text-[0.95em]")}>{card.text}</p>
      <p className={cn("mt-[0.25em] flex items-center gap-[0.4em] leading-none text-muted", compact ? "text-[0.5em]" : "text-[0.62em]")}>
        <span className="truncate">{card.name}</span>
        {card.isBot ? <BotBadge className="px-[0.35em]! text-[1.2em]! leading-[1.3]!" /> : null}
      </p>
    </m.div>
  );
}

function EmptyRain({ compact }: { compact: boolean }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-[0.8em] text-center">
      <m.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className={cn("font-display font-extrabold text-text/90", compact ? "text-[0.95em]" : "text-[2.3em]")}
      >
        {SCREEN_COPY.storm.empty}
      </m.p>
      <ul className="flex flex-wrap items-center justify-center gap-[0.6em]">
        {STORM_NUDGES.map((n, i) => (
          <m.li
            key={n}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 + i * 0.12 }}
            className={cn("rounded-pill border border-line bg-surface px-[0.9em] py-[0.4em] text-muted", compact ? "text-[0.6em]" : "text-[1em]")}
          >
            {n}
          </m.li>
        ))}
      </ul>
    </div>
  );
}

export function StormView({ state, feed }: { state: PublicState; feed: FeedIdea[] }) {
  const { compact, offsetMs, metrics, px } = useStage();
  const cols = compact ? 3 : 5;
  const plan = useMemo(() => planRain(feed, cols, compact ? 15 : RAIN_CAP, compact ? 14 : 17), [feed, cols, compact]);
  const ideas = Math.max(state.stats.ideasThisRound, plan.count);

  return (
    <div className="absolute inset-0 flex flex-col" style={{ paddingInline: px(metrics.padX), paddingTop: px(compact ? 0 : 6), paddingBottom: px(compact ? 8 : 26), gap: px(compact ? 6 : 14) }}>
      <div className="flex shrink-0 items-start justify-between" style={{ gap: px(compact ? 12 : 40) }}>
        <div className="min-w-0">
          <h2 className={cn("line-clamp-2 font-display leading-[1.02] font-extrabold tracking-tight", compact ? "text-[1.15em]" : "text-[2.5em]")}>{state.prompt?.title}</h2>
          {state.prompt?.text && !compact ? <p className="mt-[0.35em] line-clamp-2 max-w-[44em] text-[0.9em] leading-snug text-text/75">{state.prompt.text}</p> : null}
        </div>
        <div className={cn("flex shrink-0 items-center", compact ? "flex-col" : "flex-row-reverse")} style={{ gap: px(compact ? 2 : 24) }}>
          <Countdown endsAt={state.phaseEndsAt} startedAt={state.phaseStartedAt} offsetMs={offsetMs} paused={state.paused} size={px(compact ? 52 : 176)} />
          <m.span
            key={ideas}
            initial={{ scale: 1.25, color: "var(--accent)" }}
            animate={{ scale: 1, color: "var(--muted)" }}
            transition={{ duration: 0.35 }}
            data-testid="screen-idea-count"
            className={cn("font-display font-extrabold tabular-nums", compact ? "text-[0.55em]" : "text-[1.5em]")}
          >
            {SCREEN_COPY.storm.ideas(ideas)}
          </m.span>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {plan.count === 0 ? (
          <EmptyRain compact={compact} />
        ) : (
          <div className="grid h-full" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: px(compact ? 8 : 20) }}>
            {plan.columns.map((col, i) => (
              <div key={i} className="cps-rain-col flex min-h-0 flex-col overflow-hidden" style={{ gap: px(compact ? 6 : 12) }}>
                {col.map((card) => (
                  <RainItem key={card.key} card={card} compact={compact} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
