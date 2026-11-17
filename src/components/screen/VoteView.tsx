"use client";
// VOTE: "2 Vote on your phone" on its numbered banner, then three boxes, one per option: the letter badge (the ⚡
// wildcard is a dashed box with its WILDCARD ribbon), the option in the note hand, and a big percentage beside a grey
// marker bar that rises from the base of the box as votes come in. Nothing here is yellow but the banner: the thread
// has not been chosen yet.
import { NumberBanner } from "@/components/ui/Banner";
import { cn } from "@/components/ui/cn";
import { Countdown } from "@/components/ui/Countdown";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { COPY } from "@/lib/copy";
import type { PublicOption, PublicState } from "@/lib/realtime/types";
import { SCREEN_COPY } from "./copy";
import { OptionRibbon, QuietPill } from "./optionParts";
import { allNarrator, labelEm, leaderId, percentages, SLOT_NAME } from "./reveal";
import { bannerStyle, BoostedTag, CreditAvatars, OptionBadge, Tag, tiltStyle, useStage } from "./stage";

const TILT = { A: -0.8, B: 0.6, C: -0.5 } as const;
const BAR_W = 70;

function FullBox({ option, pct, votes, leading, index }: { option: PublicOption; pct: number; votes: number; leading: boolean; index: number }) {
  const { px } = useStage();
  const pad = 26;
  return (
    <article
      data-testid={`screen-option-${option.slot}`}
      data-role="vote"
      aria-label={`${SLOT_NAME[option.slot]}: ${option.label}. ${pct} percent`}
      style={{ ...tiltStyle(TILT[option.slot]), ["--placed-delay" as string]: `${60 + index * 90}ms` }}
      className={cn("cps-box cps-box-poster placed min-h-0 min-w-0 flex-1 basis-0", index % 2 === 1 && "cps-box-alt", option.kind === "wildcard" && "cps-box-dashed")}
    >
      <div className="absolute z-10" style={{ left: px(22), top: px(-40) }}>
        <OptionBadge slot={option.slot} size={84} />
      </div>
      <OptionRibbon option={option} />
      <div className="flex h-full min-h-0 flex-col" style={{ padding: px(pad), paddingTop: px(60), paddingRight: px(pad + BAR_W + 22) }}>
        {option.boosted ? <BoostedTag className="mb-[0.4em] self-start" /> : null}
        <p className="leading-[1.12] text-balance text-ink" style={{ fontSize: `${labelEm(option.label)}em` }}>
          {option.label}
        </p>
        {option.supporters > 0 ? (
          <div className="mt-[0.5em] flex items-center gap-[0.6em] text-ink-notes">
            <CreditAvatars credit={option.credit} size={40} />
            <span>{SCREEN_COPY.vote.fromIdeas(option.supporters)}</span>
          </div>
        ) : null}
        <div className="mt-auto flex flex-col items-start gap-[0.3em]">
          <span className="font-display text-[3.9em] leading-[0.9] tabular-nums">
            {pct}
            <span className="text-[0.5em]">%</span>
          </span>
          <span className="flex items-center gap-[0.6em] text-[0.95em] tabular-nums">
            {SCREEN_COPY.vote.votes(votes)}
            {leading ? <Tag>{SCREEN_COPY.vote.leading}</Tag> : null}
          </span>
        </div>
      </div>
      <div aria-hidden="true" className="cps-bar absolute" style={{ right: px(pad), top: px(60), bottom: px(pad), width: px(BAR_W) }}>
        <span className="bar-fill-grey" data-up={pct > 0 ? "1" : undefined} style={{ height: `${pct}%` }} />
      </div>
    </article>
  );
}

function CompactBox({ option, pct }: { option: PublicOption; pct: number }) {
  return (
    <article
      data-testid={`screen-option-${option.slot}`}
      data-role="vote"
      aria-label={`${SLOT_NAME[option.slot]}: ${option.label}. ${pct} percent`}
      className={cn("cps-note min-h-0 flex-1 basis-0", option.kind === "wildcard" && "border-dashed")}
    >
      <div className="flex h-full items-center gap-[0.6em] px-[0.6em]">
        <OptionBadge slot={option.slot} size={32} />
        <div className="flex min-w-0 flex-1 flex-col gap-[0.35em]">
          <p className="line-clamp-2 text-[0.8em] leading-[1.12] text-ink">{option.label}</p>
          <ProgressBar value={pct / 100} tone="light" label={`${SLOT_NAME[option.slot]}, ${pct} percent`} className="h-[0.5em]!" />
        </div>
        <span className="w-[2.6em] shrink-0 text-right font-display text-[1.25em] leading-none tabular-nums">{pct}%</span>
      </div>
    </article>
  );
}

export function VoteView({ state }: { state: PublicState }) {
  const { compact, offsetMs, metrics, px } = useStage();
  const options = state.options ?? [];
  const pcts = percentages(options.map((o) => o.id), state.tally);
  const leader = leaderId(options, state.tally);

  return (
    <div className="absolute inset-0 flex flex-col" style={{ paddingInline: px(metrics.padX), paddingBottom: px(compact ? 8 : 26) }}>
      <div className="flex shrink-0 items-start justify-between" style={{ height: px(compact ? 44 : 130), gap: px(compact ? 8 : 24), paddingTop: px(compact ? 2 : 4) }}>
        <h2 className="m-0 leading-none">
          <NumberBanner n={state.roundNo} label={SCREEN_COPY.vote.now} play style={bannerStyle(px(compact ? 20 : 40))} />
        </h2>
        {allNarrator(options) ? <QuietPill /> : null}
        <div className="cps-disc shrink-0" style={{ padding: px(compact ? 2 : 6) }}>
          <Countdown endsAt={state.phaseEndsAt} startedAt={state.phaseStartedAt} offsetMs={offsetMs} paused={state.paused} size={px(compact ? 28 : 108)} />
        </div>
      </div>

      <div className={cn("flex min-h-0 flex-1", compact ? "flex-col" : "flex-row")} style={{ gap: px(compact ? 6 : 44) }}>
        {options.length === 0 ? <p className="cps-slip m-auto px-[0.9em] py-[0.4em] text-[1.4em]">{COPY.states.paused.body}</p> : null}
        {options.map((o, i) =>
          compact ? (
            <CompactBox key={o.id} option={o} pct={pcts[o.id] ?? 0} />
          ) : (
            <FullBox key={o.id} option={o} pct={pcts[o.id] ?? 0} votes={Number(state.tally?.[o.id] ?? 0)} leading={leader === o.id} index={i} />
          ),
        )}
      </div>
    </div>
  );
}
