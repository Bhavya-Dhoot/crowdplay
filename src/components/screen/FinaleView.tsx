"use client";
// FINALE: the pull-back poster of the whole story. The story's title on a banner, the tagline, the scenes as numbered
// boxes joined by yellow fat arrows (the winning line of each), the recap, and the cast list of every canon maker. The
// poster builds up scene by scene: box placed, number banner drawn, arrow drawn, next box. The recap and tagline arrive
// a moment after the phase starts (empty strings until the narrator finishes), so an honest "Writing the finale" holds
// their place instead of a blank.
import { Fragment, type CSSProperties } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Banner, NumberBanner } from "@/components/ui/Banner";
import { BotBadge } from "@/components/ui/BotBadge";
import { cn } from "@/components/ui/cn";
import { FatArrow } from "@/components/ui/FatArrow";
import { Swash } from "@/components/ui/Swash";
import type { PublicState } from "@/lib/realtime/types";
import { SCREEN_COPY } from "./copy";
import { bannerPx } from "./fit";
import { bannerStyle, tiltStyle, TypingDots, useStage } from "./stage";

const ROW_PX = 84;
const ROLL_SPEED = 62; // canvas px per second
const SCENE_TILT = [-0.8, 0.6, -0.4] as const;

export function FinaleView({ state }: { state: PublicState }) {
  const { compact, reduced, metrics, px } = useStage();
  const fin = state.finale;
  const makers = fin?.canonMakers ?? [];
  const title = fin?.storyTitle?.trim() || state.title || SCREEN_COPY.finale.untitled;
  const recap = fin?.recap?.trim() ?? "";
  const tagline = fin?.tagline?.trim() ?? "";
  const writing = recap === "";
  // The state carries the last three one-line beats: number them back from the last scene played.
  const beats = state.storySoFar.slice(-3);
  const last = Math.max(beats.length, Math.min(state.roundNo, state.roundsTotal));
  const first = last - beats.length + 1;

  const rowPx = compact ? 40 : ROW_PX;
  const rollH = metrics.h - metrics.header - metrics.footer - (compact ? 90 : 190);
  // Only a long cast scrolls; a short one sits still on the sheet.
  const rolls = !reduced && makers.length * rowPx > rollH;
  const seconds = Math.max(14, Math.round((makers.length * rowPx + rollH) / (compact ? 34 : ROLL_SPEED)));
  const leftW = metrics.w - metrics.padX * 2 - (compact ? 16 : 56) - (compact ? 11.5 : 21) * 28;

  return (
    <div
      className="absolute inset-0 grid items-start"
      style={{ paddingInline: px(metrics.padX), paddingBottom: px(compact ? 8 : 26), paddingTop: px(compact ? 4 : 10), gap: px(compact ? 16 : 56), gridTemplateColumns: compact ? "1fr 11.5em" : "1fr 21em" }}
    >
      <div className="flex min-h-0 min-w-0 flex-col items-center" style={{ gap: px(compact ? 8 : 24) }}>
        <h2 data-testid="screen-story-title" className="m-0 shrink-0 leading-none">
          <Banner size="xl" play style={bannerStyle(px(bannerPx(title, leftW - (compact ? 8 : 40), compact ? 24 : 62)))}>
            {title}
          </Banner>
        </h2>
        {tagline ? (
          <p style={tiltStyle(0.5)} className={cn("cps-slip cps-tape placed max-w-full leading-tight", compact ? "line-clamp-1 px-[0.7em] py-[0.25em] text-[0.75em]" : "line-clamp-2 px-[0.9em] py-[0.35em] text-[1.45em]")}>
            {tagline}
          </p>
        ) : null}

        {beats.length > 0 ? (
          <div className="flex w-full min-w-0 items-stretch justify-center" style={{ gap: px(compact ? 4 : 14), marginTop: px(compact ? 12 : 34) }}>
            {beats.map((beat, i) => (
              <Fragment key={`${first + i}:${beat}`}>
                {i > 0 ? (
                  <span className="self-center">
                    <FatArrow size={px(compact ? 20 : 54)} delayMs={500 + i * 520} seed={`scene-${first + i}`} />
                  </span>
                ) : null}
                <section
                  style={{ ...tiltStyle(SCENE_TILT[i % 3]), ["--placed-delay" as string]: `${i * 520}ms` }}
                  className={cn("cps-box cps-box-poster placed min-w-0 flex-1", compact ? "max-w-[9em] px-[0.5em] pt-[1.35em] pb-[0.5em]" : "max-w-[12.2em] px-[0.7em] pt-[1.3em] pb-[0.9em]", i % 2 === 1 && "cps-box-alt")}
                >
                  <div className="absolute whitespace-nowrap" style={{ left: px(compact ? 4 : 10), top: px(compact ? -14 : -36) }}>
                    <NumberBanner n={first + i} label={SCREEN_COPY.finale.scene} play delayMs={i * 520 + 300} style={bannerStyle(px(compact ? 18 : 34))} />
                  </div>
                  <p className={cn("text-ink", compact ? "line-clamp-4 text-[0.62em] leading-[1.25]" : "line-clamp-5 text-[1.3em] leading-[1.22]")}>{beat}</p>
                </section>
              </Fragment>
            ))}
          </div>
        ) : null}

        {writing ? (
          <p className={cn("cps-slip flex items-center px-[0.9em] py-[0.35em]", compact ? "text-[0.7em]" : "text-[1.3em]")} style={{ marginTop: px(compact ? 4 : 10) }}>
            {SCREEN_COPY.finale.writing}
            <TypingDots />
          </p>
        ) : (
          <p
            data-testid="screen-recap"
            style={tiltStyle(-0.4)}
            className={cn("cps-slip cps-tape placed", compact ? "line-clamp-3 px-[0.7em] py-[0.3em] text-[0.62em] leading-snug" : "line-clamp-4 px-[0.9em] py-[0.5em] text-[1.35em] leading-[1.35]")}
          >
            {recap}
          </p>
        )}
      </div>

      <section
        data-testid="screen-credits"
        aria-label={SCREEN_COPY.finale.makersLabel}
        style={{ ...tiltStyle(0.7), marginBlock: px(compact ? 4 : 10), ["--placed-delay" as string]: "300ms" }}
        className={cn("cps-box cps-box-poster placed flex min-h-0 flex-col overflow-hidden", rolls ? "self-stretch" : "self-start")}
      >
        <h3 className={cn("relative z-10 shrink-0 border-b-[length:var(--bw-s)] border-dashed border-ink", compact ? "px-[0.7em] pt-[0.7em] pb-[0.3em] text-[0.75em]" : "px-[0.9em] pt-[0.8em] pb-[0.5em] text-[1.35em]")}>
          <Swash play delayMs={900}>
            {SCREEN_COPY.finale.canon}
          </Swash>{" "}
          {SCREEN_COPY.finale.makers}
        </h3>
        {makers.length === 0 ? (
          <p className={cn("m-auto px-[1em] py-[0.6em] text-center text-ink-notes", compact ? "text-[0.65em]" : "text-[1.1em]")}>{SCREEN_COPY.finale.noMakers}</p>
        ) : (
          <div className={cn("relative min-h-0 flex-1 overflow-hidden", rolls && "cps-fade-y")}>
            <ul
              className={cn(rolls ? "cps-roll" : "", "px-[0.8em]")}
              style={rolls ? ({ "--roll": `${seconds}s`, "--roll-from": `${px(rollH)}px` } as CSSProperties) : undefined}
            >
              {makers.map((c) => (
                <li key={c.name} className="flex items-center gap-[0.7em]" style={{ height: px(rowPx) }}>
                  <Avatar name={c.name} size={px(compact ? 28 : 58)} />
                  <span className="flex min-w-0 flex-1 items-baseline gap-[0.4em]">
                    <span className={cn("min-w-0 truncate font-display", compact ? "text-[0.72em]" : "text-[1.25em]")}>
                      {c.name}
                      {c.bot ? <BotBadge className="ml-[0.4em] px-[0.35em]! text-[0.8em]! leading-[1.3]!" /> : null}
                    </span>
                    <span aria-hidden="true" className="h-0 min-w-[0.6em] flex-1 border-b-[length:var(--bw-s)] border-dotted border-ink-faint" />
                    <span className={cn("shrink-0 text-ink-notes tabular-nums", compact ? "text-[0.65em]" : "text-[1.1em]")}>×{c.count}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
