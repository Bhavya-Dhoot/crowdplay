"use client";
// VOTE and REVEAL share one board so the reveal is a real transition, not a cut: three columns with
// live bars while the room votes; when the winner is known its column grows to fill the stage,
// narration appears line by line under it, and the other two shrink away with their final percentages.
import { Zap } from "lucide-react";
import { Countdown } from "@/components/ui/Countdown";
import { cn } from "@/components/ui/cn";
import { m } from "@/components/ui/motion";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { COPY, creditLine } from "@/lib/copy";
import type { PublicOption, PublicState } from "@/lib/realtime/types";
import { SCREEN_COPY } from "./copy";
import { allNarrator, leaderId, narrationLines, narrationSize, percentages, SLOT_NAME, winnerOf } from "./reveal";
import { CreditAvatars, OptionBadge, Tag, TypingDots, useStage } from "./stage";

type Role = "vote" | "winner" | "loser";

const SLOT_VAR = { A: "--opt-a", B: "--opt-b", C: "--opt-c" } as const;
const SLOT_BORDER = { A: "border-opt-a", B: "border-opt-b", C: "border-opt-c" } as const;
const SLOT_TONE = { A: "a", B: "b", C: "c" } as const;
const EASE = [0.22, 1, 0.36, 1] as const;

function OptionTags({ option }: { option: PublicOption }) {
  return (
    <>
      {option.kind === "wildcard" ? (
        <Tag tone="wild">
          <Zap aria-hidden="true" className="size-[1em]" fill="currentColor" />
          {SCREEN_COPY.vote.wildcard}
        </Tag>
      ) : null}
      {option.kind === "narrator" ? <Tag tone="outline">{COPY.reveal.narratorPick}</Tag> : null}
      {option.boosted ? <Tag tone="accent">⚡ boosted in demo</Tag> : null}
    </>
  );
}

function VoteCard({ option, pct, votes, leading }: { option: PublicOption; pct: number; votes: number; leading: boolean }) {
  const { compact } = useStage();
  if (compact) {
    return (
      <div className="flex h-full items-center gap-[0.6em] px-[0.6em] py-[0.35em]">
        <OptionBadge slot={option.slot} size={34} />
        <div className="flex min-w-0 flex-1 flex-col gap-[0.35em]">
          <p className="line-clamp-2 font-display text-[0.78em] leading-[1.12] font-extrabold">{option.label}</p>
          <ProgressBar value={pct / 100} tone={SLOT_TONE[option.slot]} label={`${SLOT_NAME[option.slot]}, ${pct} percent`} className="h-[0.5em]!" />
        </div>
        <span className="w-[2.6em] shrink-0 text-right font-display text-[1.25em] leading-none font-extrabold tabular-nums">{pct}%</span>
      </div>
    );
  }
  return (
    <div className="relative flex h-full flex-col p-[0.95em]">
      {leading ? <Tag tone="accent" className="absolute top-[0.9em] right-[0.9em]">{SCREEN_COPY.vote.leading}</Tag> : null}
      <div className="flex items-center gap-[0.6em] pr-[4.5em]">
        <OptionBadge slot={option.slot} size={86} />
        <div className="flex flex-wrap items-center gap-[0.4em]">
          <OptionTags option={option} />
        </div>
      </div>
      <p className="mt-[0.6em] line-clamp-4 font-display text-[2em] leading-[1.08] font-extrabold text-balance">{option.label}</p>
      <div className="mt-auto flex flex-col gap-[0.45em]">
        {option.supporters > 0 ? (
          <div className="flex items-center gap-[0.6em] text-[0.72em] font-semibold text-muted">
            <CreditAvatars credit={option.credit} size={40} />
            <span>{SCREEN_COPY.vote.fromIdeas(option.supporters)}</span>
          </div>
        ) : null}
        <div className="flex items-end justify-between">
          <span className="font-display text-[3.7em] leading-[0.9] font-extrabold tabular-nums">
            {pct}
            <span className="text-[0.5em]">%</span>
          </span>
          <span className="pb-[0.2em] text-[0.8em] font-semibold text-muted tabular-nums">{SCREEN_COPY.vote.votes(votes)}</span>
        </div>
        <ProgressBar value={pct / 100} tone={SLOT_TONE[option.slot]} label={`${SLOT_NAME[option.slot]}, ${pct} percent`} className="h-[1.15em]!" />
      </div>
    </div>
  );
}

function Narration({ text }: { text: string | null }) {
  const { compact, reduced } = useStage();
  const lines = narrationLines(text);
  if (lines.length === 0) {
    return (
      <p className={cn("flex items-center font-semibold text-muted", compact ? "text-[0.65em]" : "text-[1.2em]")}>
        {SCREEN_COPY.reveal.writing}
        <TypingDots />
      </p>
    );
  }
  const size = compact ? narrationSize(text) * 0.55 : narrationSize(text);
  return (
    <div className="min-h-0 space-y-[0.45em] overflow-hidden" data-testid="narration">
      {lines.map((line, i) => (
        <m.p
          key={`${i}:${line}`}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0.15 : 0.5, delay: reduced ? 0 : 0.8 + i * 1.25, ease: EASE }}
          className="leading-[1.28] font-medium text-text"
          style={{ fontSize: `${size}em` }}
        >
          {line}
        </m.p>
      ))}
    </div>
  );
}

function WinnerCard({ option, pct, outcome }: { option: PublicOption; pct: number; outcome: PublicState["outcome"] }) {
  const { compact } = useStage();
  const credit = outcome?.credit ?? option.credit;
  const more = outcome?.more ?? option.more;
  const line = creditLine(credit, more);
  // creditLine owns the wording ("+ N others"); names are re-drawn below so a name never breaks across lines.
  const extra = line.slice(creditLine(credit, 0).length).replace(/^ /, "");
  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.35 }}
      data-testid="screen-outcome"
      className={cn("flex h-full min-h-0 flex-col", compact ? "p-[0.7em]" : "p-[1.2em]")}
    >
      <div className={cn("flex items-center", compact ? "gap-[0.5em]" : "gap-[0.8em]")}>
        <OptionBadge slot={option.slot} size={compact ? 32 : 92} />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-[0.4em]">
          <OptionTags option={option} />
        </div>
        <span className={cn("font-display leading-none font-extrabold tabular-nums", compact ? "text-[1.2em]" : "text-[3em]")}>{pct}%</span>
      </div>
      <h3 className={cn("font-display leading-[1.06] font-extrabold text-balance", compact ? "mt-[0.35em] line-clamp-2 text-[1em]" : "mt-[0.55em] line-clamp-3 text-[2.15em]")}>{option.label}</h3>
      <div className={cn("flex min-h-0 flex-1 flex-col", compact ? "mt-[0.35em]" : "mt-[0.7em]")}>
        <Narration text={outcome?.narration ?? null} />
      </div>
      <div data-testid="screen-credits" className={cn("flex items-center border-t border-line/70", compact ? "mt-[0.3em] gap-[0.5em] pt-[0.35em]" : "mt-[0.5em] gap-[0.8em] pt-[0.7em]")}>
        <CreditAvatars credit={credit} size={compact ? 24 : 66} />
        <p className={cn("min-w-0 font-semibold", compact ? "line-clamp-1 text-[0.6em]" : "line-clamp-2 text-[1.3em] leading-tight text-balance")}>
          {line ? (
            <>
              <span className="font-medium text-muted">{SCREEN_COPY.reveal.credit} </span>
              {credit.slice(0, 3).map((c, i, all) => (
                <span key={c.name}>
                  <span className="whitespace-nowrap">
                    @{c.name}
                    {c.bot ? " 🤖" : ""}
                  </span>
                  {i < all.length - 1 ? ", " : ""}
                </span>
              ))}
              {extra ? (
                <>
                  {" "}
                  <span className="whitespace-nowrap">{extra}</span>
                </>
              ) : null}
            </>
          ) : (
            SCREEN_COPY.reveal.improvised
          )}
        </p>
      </div>
    </m.div>
  );
}

function LoserCard({ option, pct }: { option: PublicOption; pct: number }) {
  const { compact } = useStage();
  if (compact) {
    return (
      <div className="flex h-full items-center gap-[0.5em] px-[0.5em]">
        <OptionBadge slot={option.slot} size={22} />
        <span className="font-display text-[0.8em] font-extrabold tabular-nums">{pct}%</span>
        <span className="line-clamp-1 min-w-0 flex-1 text-[0.5em] text-muted">{option.label}</span>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col items-center gap-[0.55em] p-[0.7em] text-center">
      <OptionBadge slot={option.slot} size={62} />
      <span className="font-display text-[1.9em] leading-none font-extrabold tabular-nums">{pct}%</span>
      <p className="line-clamp-6 text-[0.6em] leading-snug text-muted">{option.label}</p>
    </div>
  );
}

export function OptionsView({ state }: { state: PublicState }) {
  const { compact, offsetMs, metrics, px } = useStage();
  const options = state.options ?? [];
  const reveal = state.phase === "REVEAL";
  const pcts = percentages(options.map((o) => o.id), state.tally);
  const leader = leaderId(options, state.tally);
  const winner = reveal ? (winnerOf(state) ?? options.find((o) => o.id === leader) ?? null) : null;
  const quiet = allNarrator(options);

  return (
    <div className="absolute inset-0 flex flex-col" style={{ paddingInline: px(metrics.padX), paddingBottom: px(compact ? 8 : 26) }}>
      <div className="flex shrink-0 items-center justify-between" style={{ height: px(compact ? 30 : 108), gap: px(compact ? 8 : 24) }}>
        <h2 className={cn("font-display font-extrabold", reveal ? "text-accent" : "", compact ? "text-[0.8em]" : "text-[1.9em]")}>
          {reveal ? SCREEN_COPY.reveal.winner : SCREEN_COPY.vote.now}
        </h2>
        {quiet ? (
          <m.p
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            data-testid="screen-quiet"
            className={cn("rounded-pill border-2 border-accent font-display font-extrabold text-accent", compact ? "px-[0.7em] py-[0.15em] text-[0.62em]" : "px-[1em] py-[0.3em] text-[1.35em]")}
          >
            {COPY.reveal.tooQuiet}
          </m.p>
        ) : null}
        <div className="flex shrink-0 justify-end" style={{ width: px(compact ? 40 : 88), height: px(compact ? 40 : 88) }}>
          {!reveal ? <Countdown endsAt={state.phaseEndsAt} startedAt={state.phaseStartedAt} offsetMs={offsetMs} paused={state.paused} size={px(compact ? 40 : 84)} /> : null}
        </div>
      </div>

      <div className={cn("flex min-h-0 flex-1", compact ? "flex-col" : "flex-row")} style={{ gap: px(compact ? 6 : 26) }}>
        {options.length === 0 ? (
          <div className="grid flex-1 place-items-center text-[1.4em] font-semibold text-muted">{COPY.states.paused.body}</div>
        ) : null}
        {options.map((o) => {
          const role: Role = !winner ? "vote" : o.id === winner.id ? "winner" : "loser";
          const weight = role === "vote" ? 1 : role === "winner" ? (compact ? 7 : 5.6) : compact ? 0.55 : 1;
          const wild = o.kind === "wildcard";
          return (
            <m.article
              key={o.id}
              data-testid={`screen-option-${o.slot}`}
              data-role={role}
              data-selected={role === "winner" ? "1" : undefined}
              aria-label={`${SLOT_NAME[o.slot]}: ${o.label}. ${pcts[o.id] ?? 0} percent`}
              initial={false}
              animate={{ flexGrow: weight, opacity: role === "loser" ? 0.6 : 1, scale: role === "loser" ? 0.97 : 1, ...(compact ? {} : { height: role === "loser" ? "38%" : "100%" }) }}
              transition={{ duration: 0.75, ease: EASE }}
              className={cn(
                "relative min-h-0 min-w-0 overflow-hidden",
                compact ? "rounded-[0.5em]" : "rounded-[0.7em]",
                role === "winner" ? cn("cps-win-glow border-2 bg-surface", SLOT_BORDER[o.slot]) : "border bg-surface/95",
                role !== "winner" && (wild && role === "vote" ? "cps-wild-glow border-wild/50" : "border-line"),
              )}
              style={{
                flexBasis: 0,
                alignSelf: compact ? "stretch" : "flex-start",
                backgroundImage: `linear-gradient(180deg, color-mix(in oklab, var(${SLOT_VAR[o.slot]}) ${role === "winner" ? 20 : 13}%, transparent), transparent 46%)`,
              }}
            >
              {role === "vote" && !compact ? (
                // Full-height layer slid up from the bottom: a transform, so a live tally never shifts layout.
                <span
                  aria-hidden="true"
                  className="absolute inset-0 transition-transform duration-500 ease-out motion-reduce:transition-none"
                  style={{
                    transform: `translateY(${100 - (pcts[o.id] ?? 0)}%)`,
                    background: `linear-gradient(180deg, color-mix(in oklab, var(${SLOT_VAR[o.slot]}) 34%, transparent), color-mix(in oklab, var(${SLOT_VAR[o.slot]}) 12%, transparent))`,
                    borderTop: (pcts[o.id] ?? 0) > 0 ? `3px solid color-mix(in oklab, var(${SLOT_VAR[o.slot]}) 85%, transparent)` : undefined,
                  }}
                />
              ) : null}
              {role === "winner" ? (
                <WinnerCard option={o} pct={pcts[o.id] ?? 0} outcome={state.outcome} />
              ) : role === "loser" ? (
                <LoserCard option={o} pct={pcts[o.id] ?? 0} />
              ) : (
                <VoteCard option={o} pct={pcts[o.id] ?? 0} votes={Number(state.tally?.[o.id] ?? 0)} leading={!reveal && leader === o.id} />
              )}
            </m.article>
          );
        })}
      </div>
    </div>
  );
}
