"use client";
// FINALE: the story's title and recap on the left, a credits roll of every canon maker on the right.
// The recap and tagline arrive a moment after the phase starts (empty strings until the narrator
// finishes), so an honest "Writing the finale" holds their place instead of a blank.
import { Avatar } from "@/components/ui/Avatar";
import { BotBadge } from "@/components/ui/BotBadge";
import { cn } from "@/components/ui/cn";
import { m } from "@/components/ui/motion";
import type { CSSProperties } from "react";
import type { PublicState } from "@/lib/realtime/types";
import { SCREEN_COPY } from "./copy";
import { TypingDots, useStage } from "./stage";

const ROW_PX = 92;
const ROLL_SPEED = 62; // canvas px per second

export function FinaleView({ state }: { state: PublicState }) {
  const { compact, reduced, metrics, px } = useStage();
  const fin = state.finale;
  const makers = fin?.canonMakers ?? [];
  const title = fin?.storyTitle?.trim() || state.title || SCREEN_COPY.finale.untitled;
  const recap = fin?.recap?.trim() ?? "";
  const tagline = fin?.tagline?.trim() ?? "";
  const writing = recap === "";

  const rowPx = compact ? 40 : ROW_PX;
  const rollH = metrics.h - metrics.header - metrics.footer - (compact ? 70 : 170);
  const seconds = Math.max(14, Math.round((makers.length * rowPx + rollH) / (compact ? 34 : ROLL_SPEED)));

  return (
    <div
      className="absolute inset-0 grid items-center"
      style={{ paddingInline: px(metrics.padX), paddingBottom: px(compact ? 8 : 26), gap: px(compact ? 16 : 72), gridTemplateColumns: compact ? "1fr 11.5em" : "1fr 21em" }}
    >
      <div className="flex min-w-0 flex-col" style={{ gap: px(compact ? 6 : 20) }}>
        <m.h2
          initial={{ opacity: 0, y: 40, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 140, damping: 20 }}
          data-testid="screen-story-title"
          className={cn("line-clamp-3 font-display leading-[0.96] font-extrabold tracking-tight text-balance", compact ? "text-[1.7em]" : "text-[4.8em]")}
        >
          {title}
        </m.h2>
        {tagline ? (
          <m.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className={cn("line-clamp-2 font-display font-bold text-accent", compact ? "text-[0.8em]" : "text-[1.8em] leading-tight")}
          >
            {tagline}
          </m.p>
        ) : null}
        {writing ? (
          <p className={cn("flex items-center font-semibold text-muted", compact ? "text-[0.7em]" : "text-[1.3em]")}>
            {SCREEN_COPY.finale.writing}
            <TypingDots />
          </p>
        ) : (
          <m.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            data-testid="screen-recap"
            className={cn("max-w-[34em] text-text/85", compact ? "line-clamp-3 text-[0.62em] leading-snug" : "line-clamp-7 text-[1.15em] leading-[1.4]")}
          >
            {recap}
          </m.p>
        )}
      </div>

      <section
        data-testid="screen-credits"
        aria-label={SCREEN_COPY.finale.makers}
        className="flex min-h-0 flex-col self-stretch overflow-hidden rounded-[0.8em] border border-line bg-surface/90"
        style={{ marginBlock: px(compact ? 4 : 10) }}
      >
        <h3 className={cn("shrink-0 border-b border-line font-display font-extrabold", compact ? "px-[0.7em] py-[0.4em] text-[0.7em]" : "px-[0.9em] py-[0.6em] text-[1.3em]")}>{SCREEN_COPY.finale.makers}</h3>
        {makers.length === 0 ? (
          <p className={cn("m-auto px-[1em] text-center font-semibold text-muted", compact ? "text-[0.65em]" : "text-[1.1em]")}>{SCREEN_COPY.finale.noMakers}</p>
        ) : (
          <div className={cn("relative min-h-0 flex-1 overflow-hidden", !reduced && "cps-fade-y")}>
            <ul
              className={cn(reduced ? "" : "cps-roll", "px-[0.8em]")}
              style={reduced ? undefined : ({ "--roll": `${seconds}s`, "--roll-from": `${px(rollH)}px` } as CSSProperties)}
            >
              {makers.map((c) => (
                <li key={c.name} className="flex items-center gap-[0.7em]" style={{ height: px(rowPx) }}>
                  <Avatar name={c.name} size={px(compact ? 28 : 62)} />
                  <span className={cn("min-w-0 flex-1 truncate font-display font-bold", compact ? "text-[0.72em]" : "text-[1.4em]")}>
                    {c.name}
                    {c.bot ? <BotBadge className="ml-[0.4em] px-[0.35em]! text-[0.8em]! leading-[1.3]!" /> : null}
                  </span>
                  <span className={cn("shrink-0 font-semibold text-accent tabular-nums", compact ? "text-[0.6em]" : "text-[1.05em]")}>×{c.count}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
