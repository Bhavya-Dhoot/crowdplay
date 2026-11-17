"use client";
// VOTE: three tall paper script cards, one per option. Each has a gel band, the lettered disc, the option in the
// script voice and a big percentage. The live fill rises from the bottom of the card BEHIND the text, inside its
// own lower zone (the label sits above it), with a feathered edge, so it never strikes through anything.
import { Countdown } from "@/components/ui/Countdown";
import { cn } from "@/components/ui/cn";
import { gelOf } from "@/components/ui/GelDisc";
import { m } from "@/components/ui/motion";
import { SPRING } from "@/components/ui/motionTokens";
import { paperCardClass } from "@/components/ui/PaperCard";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { COPY } from "@/lib/copy";
import type { PublicOption, PublicState } from "@/lib/realtime/types";
import { SCREEN_COPY } from "./copy";
import { OptionStamp, QuietPill } from "./optionParts";
import { allNarrator, labelEm, leaderId, percentages, SLOT_NAME } from "./reveal";
import { CreditAvatars, OptionBadge, Tag, useStage } from "./stage";

const GEL_VAR = { A: "--gel-a", B: "--gel-b", C: "--gel-c" } as const;
const TONE = { A: "a", B: "b", C: "c" } as const;
const TILT = { A: -0.8, B: 0.6, C: -0.5 } as const;

/** Liquid tint in the option's gel, fading in over the top of the layer so its edge never reads as a line. */
function fillGradient(slot: PublicOption["slot"]): string {
  const g = `var(${GEL_VAR[slot]})`;
  return `linear-gradient(to bottom, transparent 0, color-mix(in oklab, ${g} 34%, var(--paper)) 14%, color-mix(in oklab, ${g} 48%, var(--paper)) 100%)`;
}

function FullCard({ option, pct, votes, leading, index }: { option: PublicOption; pct: number; votes: number; leading: boolean; index: number }) {
  return (
    <m.article
      data-testid={`screen-option-${option.slot}`}
      data-role="vote"
      aria-label={`${SLOT_NAME[option.slot]}: ${option.label}. ${pct} percent`}
      initial={{ opacity: 0, y: 44 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING.land, delay: 0.06 + index * 0.08 }}
      style={{ ["--tilt" as string]: `${TILT[option.slot]}deg` }}
      className={paperCardClass({ gel: gelOf(option.slot), edge: option.kind === "wildcard" ? "wild" : undefined, className: "min-h-0 min-w-0 flex-1 basis-0 rounded-[0.7em]" })}
    >
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 overflow-hidden rounded-b-[0.7em]" style={{ height: "52%" }}>
        <span
          className="absolute inset-0 transition-transform duration-500 ease-out motion-reduce:transition-none"
          style={{ transform: `translateY(${100 - pct}%)`, background: fillGradient(option.slot) }}
        />
      </div>
      <OptionStamp option={option} size={34} delayMs={500 + index * 80} />
      <div className="relative z-10 flex h-full flex-col p-[0.95em]">
        <div className="flex items-center gap-[0.6em]">
          <OptionBadge slot={option.slot} size={80} />
          {option.boosted ? <Tag tone="outline">⚡ boosted in demo</Tag> : null}
        </div>
        <p className="mt-[0.5em] font-script leading-[1.12] font-semibold text-balance text-ink" style={{ fontSize: `${labelEm(option.label)}em` }}>
          {option.label}
        </p>
        {option.supporters > 0 ? (
          <div className="mt-[0.5em] flex items-center gap-[0.6em] font-semibold text-ink-muted">
            <CreditAvatars credit={option.credit} size={40} />
            <span>{SCREEN_COPY.vote.fromIdeas(option.supporters)}</span>
          </div>
        ) : null}
        <div className="mt-auto flex items-end justify-between">
          <span className="font-display text-[3.9em] leading-[0.9] font-extrabold tabular-nums text-ink">
            {pct}
            <span className="text-[0.5em]">%</span>
          </span>
          <span className="flex flex-col items-end gap-[0.35em] pb-[0.2em]">
            {leading ? <Tag tone="ink">{SCREEN_COPY.vote.leading}</Tag> : null}
            <span className="text-[0.9em] font-semibold text-ink tabular-nums">{SCREEN_COPY.vote.votes(votes)}</span>
          </span>
        </div>
      </div>
    </m.article>
  );
}

function CompactCard({ option, pct }: { option: PublicOption; pct: number }) {
  return (
    <m.article
      data-testid={`screen-option-${option.slot}`}
      data-role="vote"
      aria-label={`${SLOT_NAME[option.slot]}: ${option.label}. ${pct} percent`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={paperCardClass({ gel: gelOf(option.slot), edge: option.kind === "wildcard" ? "wild" : undefined, className: "min-h-0 flex-1 basis-0 rounded-[0.5em]" })}
    >
      <div className="relative z-10 flex h-full items-center gap-[0.6em] px-[0.6em] pt-[0.25em]">
        <OptionBadge slot={option.slot} size={34} />
        <div className="flex min-w-0 flex-1 flex-col gap-[0.35em]">
          <p className="line-clamp-2 font-script text-[0.78em] leading-[1.12] font-semibold text-ink">{option.label}</p>
          <ProgressBar value={pct / 100} tone={TONE[option.slot]} label={`${SLOT_NAME[option.slot]}, ${pct} percent`} className="h-[0.5em]!" />
        </div>
        <span className="w-[2.6em] shrink-0 text-right font-display text-[1.25em] leading-none font-extrabold tabular-nums text-ink">{pct}%</span>
      </div>
    </m.article>
  );
}

export function VoteView({ state }: { state: PublicState }) {
  const { compact, offsetMs, metrics, px } = useStage();
  const options = state.options ?? [];
  const pcts = percentages(options.map((o) => o.id), state.tally);
  const leader = leaderId(options, state.tally);

  return (
    <div className="absolute inset-0 flex flex-col" style={{ paddingInline: px(metrics.padX), paddingBottom: px(compact ? 8 : 26) }}>
      <div className="flex shrink-0 items-center justify-between" style={{ height: px(compact ? 30 : 108), gap: px(compact ? 8 : 24) }}>
        <h2 className={cn("font-display font-extrabold", compact ? "text-[0.8em]" : "text-[1.9em]")}>{SCREEN_COPY.vote.now}</h2>
        {allNarrator(options) ? <QuietPill /> : null}
        <div className="flex shrink-0 justify-end" style={{ width: px(compact ? 40 : 88), height: px(compact ? 40 : 88) }}>
          <Countdown endsAt={state.phaseEndsAt} startedAt={state.phaseStartedAt} offsetMs={offsetMs} paused={state.paused} size={px(compact ? 40 : 84)} />
        </div>
      </div>

      <div className={cn("flex min-h-0 flex-1", compact ? "flex-col" : "flex-row")} style={{ gap: px(compact ? 6 : 32) }}>
        {options.length === 0 ? <p className="m-auto text-[1.4em] font-semibold text-muted-on-stage">{COPY.states.paused.body}</p> : null}
        {options.map((o, i) =>
          compact ? (
            <CompactCard key={o.id} option={o} pct={pcts[o.id] ?? 0} />
          ) : (
            <FullCard key={o.id} option={o} pct={pcts[o.id] ?? 0} votes={Number(state.tally?.[o.id] ?? 0)} leading={leader === o.id} index={i} />
          ),
        )}
      </div>
    </div>
  );
}
