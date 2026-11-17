"use client";
// FINALE: a printed playbill. The story's title page (title, tagline, recap) on one sheet, the cast list of every
// canon maker on another. The recap and tagline arrive a moment after the phase starts (empty strings until the
// narrator finishes), so an honest "Writing the finale" holds their place instead of a blank.
import type { CSSProperties } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { BotBadge } from "@/components/ui/BotBadge";
import { cn } from "@/components/ui/cn";
import { m } from "@/components/ui/motion";
import { SPRING } from "@/components/ui/motionTokens";
import { paperCardClass } from "@/components/ui/PaperCard";
import type { PublicState } from "@/lib/realtime/types";
import { SCREEN_COPY } from "./copy";
import { TypingDots, useStage } from "./stage";

const ROW_PX = 84;
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
  // Only a long cast scrolls; a short one sits still on the sheet.
  const rolls = !reduced && makers.length * rowPx > rollH;
  const seconds = Math.max(14, Math.round((makers.length * rowPx + rollH) / (compact ? 34 : ROLL_SPEED)));

  return (
    <div
      className="absolute inset-0 grid items-center"
      style={{ paddingInline: px(metrics.padX), paddingBottom: px(compact ? 8 : 26), gap: px(compact ? 16 : 56), gridTemplateColumns: compact ? "1fr 11.5em" : "1fr 21em" }}
    >
      <m.div
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={SPRING.lift}
        style={{ ["--tilt" as string]: "-0.8deg" }}
        className={paperCardClass({ gel: "a", className: cn("flex min-w-0 flex-col overflow-hidden", compact ? "gap-[0.3em] rounded-[0.5em] p-[0.8em]" : "gap-[0.35em] rounded-[0.6em] px-[1.2em] py-[1em]") })}
      >
        {state.title !== title ? (
          <p className={cn("truncate border-b-[0.06em] border-paper-edge pb-[0.3em] font-display font-bold text-ink-muted", compact ? "text-[0.6em]" : "text-[0.95em]")}>{state.title}</p>
        ) : null}
        <h2
          data-testid="screen-story-title"
          className={cn("line-clamp-3 font-display leading-[0.98] font-extrabold tracking-tight text-balance text-ink", compact ? "text-[1.5em]" : "mt-[0.1em] text-[4.2em]")}
        >
          {title}
        </h2>
        {tagline ? (
          <m.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className={cn("line-clamp-2 font-script font-semibold text-ink", compact ? "text-[0.75em]" : "text-[1.7em] leading-tight")}
          >
            {tagline}
          </m.p>
        ) : null}
        {writing ? (
          <p className={cn("flex items-center font-semibold text-ink-muted", compact ? "text-[0.7em]" : "text-[1.3em]")}>
            {SCREEN_COPY.finale.writing}
            <TypingDots />
          </p>
        ) : (
          <m.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            data-testid="screen-recap"
            className={cn("max-w-[34em] border-t-[0.06em] border-paper-edge pt-[0.4em] font-script text-ink", compact ? "line-clamp-3 text-[0.6em] leading-snug" : "line-clamp-6 text-[1.15em] leading-[1.4]")}
          >
            {recap}
          </m.p>
        )}
      </m.div>

      <m.section
        data-testid="screen-credits"
        aria-label={SCREEN_COPY.finale.makers}
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING.lift, delay: 0.15 }}
        style={{ ["--tilt" as string]: "0.8deg", marginBlock: px(compact ? 4 : 10) }}
        className={paperCardClass({ tone: "paper-2", gel: "c", className: cn("flex min-h-0 flex-col overflow-hidden rounded-[0.6em]", rolls ? "self-stretch" : "self-center") })}
      >
        <h3 className={cn("relative z-10 shrink-0 border-b-[0.06em] border-paper-edge font-display font-extrabold text-ink", compact ? "px-[0.7em] pt-[0.7em] pb-[0.3em] text-[0.7em]" : "px-[0.9em] pt-[0.8em] pb-[0.5em] text-[1.3em]")}>{SCREEN_COPY.finale.makers}</h3>
        {makers.length === 0 ? (
          <p className={cn("m-auto px-[1em] text-center font-semibold text-ink-muted", compact ? "text-[0.65em]" : "text-[1.1em]")}>{SCREEN_COPY.finale.noMakers}</p>
        ) : (
          <div className={cn("relative min-h-0 flex-1 overflow-hidden", rolls && "cps-fade-y")}>
            <ul
              className={cn(rolls ? "cps-roll" : "", "px-[0.8em]")}
              style={rolls ? ({ "--roll": `${seconds}s`, "--roll-from": `${px(rollH)}px` } as CSSProperties) : undefined}
            >
              {makers.map((c) => (
                <li key={c.name} className="flex items-center gap-[0.7em]" style={{ height: px(rowPx) }}>
                  <Avatar name={c.name} size={px(compact ? 28 : 58)} />
                  <span className={cn("min-w-0 truncate font-display font-bold text-ink", compact ? "text-[0.72em]" : "text-[1.3em]")}>
                    {c.name}
                    {c.bot ? <BotBadge className="ml-[0.4em] border-paper-edge bg-paper px-[0.35em]! text-[0.8em]! leading-[1.3]!" /> : null}
                  </span>
                  <span aria-hidden="true" className="mb-[0.3em] min-w-[0.6em] flex-1 self-end border-b-[0.1em] border-dotted border-ink-muted/60" />
                  <span className={cn("shrink-0 font-semibold text-ink-muted tabular-nums", compact ? "text-[0.6em]" : "text-[1.05em]")}>×{c.count}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </m.section>
    </div>
  );
}
