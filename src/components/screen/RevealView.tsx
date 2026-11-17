"use client";
// REVEAL: the winner is the big paper box in the middle and the pen draws a yellow loop around it (700 ms); then the
// CANON ribbon is written in on its edge, one burst of doodle confetti, and the narration is written out by the pen
// in the note hand. The byline closes the box. The other two options shrink to small grey boxes on either side. This
// is the only view where the ink "boils" (the loop and the ribbon's outline).
import { Pause } from "lucide-react";
import { useEffect, useState } from "react";
import { NumberBanner } from "@/components/ui/Banner";
import { cn } from "@/components/ui/cn";
import { PenLoop } from "@/components/ui/PenLoop";
import { Ribbon } from "@/components/ui/Ribbon";
import { ScriptText } from "@/components/ui/ScriptText";
import { COPY, creditLine } from "@/lib/copy";
import type { PublicOption, PublicState } from "@/lib/realtime/types";
import { SCREEN_COPY } from "./copy";
import { QuietPill } from "./optionParts";
import { allNarrator, leaderId, narrationPx, percentages, SLOT_NAME, winnerOf } from "./reveal";
import { bannerStyle, BoostedTag, CreditAvatars, OptionBadge, tiltStyle, TypingDots, useStage } from "./stage";

/** The loop starts after the box is placed, the ribbon after the loop, the narration after the ribbon's word. */
const LOOP_DELAY_MS = 250;
const RIBBON_DELAY_MS = 900;
const LANDED_MS = 1500;

function Narration({ text, landed }: { text: string | null; landed: boolean }) {
  const { compact, px } = useStage();
  if (!text || !text.trim()) {
    return (
      <p className={cn("flex items-center text-ink-notes", compact ? "text-[0.7em]" : "text-[1.3em]")}>
        {SCREEN_COPY.reveal.writing}
        <TypingDots />
      </p>
    );
  }
  const size = narrationPx(text) * (compact ? 0.52 : 1);
  return (
    <div className="min-h-0 overflow-hidden" data-testid="narration" style={{ fontSize: px(size) }}>
      <ScriptText text={text} as="p" play={landed} cps={Math.min(90, Math.max(34, Math.round(text.length / 5.5)))} className="text-[1em] leading-[1.34] text-ink" />
    </div>
  );
}

function Byline({ credit, more }: { credit: PublicOption["credit"]; more: number }) {
  const { compact } = useStage();
  const line = creditLine(credit, more);
  // creditLine owns the wording ("+ N others"); names are re-drawn below so a name never breaks across lines.
  const extra = line.slice(creditLine(credit, 0).length).replace(/^ /, "");
  return (
    <div data-testid="screen-credits" className={cn("flex items-center border-t-[length:var(--bw-s)] border-dashed border-ink", compact ? "mt-[0.3em] gap-[0.5em] pt-[0.35em]" : "mt-[0.5em] gap-[0.8em] pt-[0.6em]")}>
      <CreditAvatars credit={credit} size={compact ? 24 : 60} />
      <p className={cn("min-w-0", compact ? "line-clamp-1 text-[0.65em]" : "line-clamp-2 text-[1.2em] leading-tight text-balance")}>
        {line ? (
          <>
            <span className="text-ink-notes">{SCREEN_COPY.reveal.credit} </span>
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
  );
}

function WinnerPage({ option, pct, outcome }: { option: PublicOption; pct: number; outcome: PublicState["outcome"] }) {
  const { compact, px } = useStage();
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLanded(true), LANDED_MS);
    return () => clearTimeout(t);
  }, []);
  const credit = outcome?.credit ?? option.credit;
  const more = outcome?.more ?? option.more;

  return (
    <PenLoop tone="yellow" shape="round" boil play delayMs={LOOP_DELAY_MS} seed={option.id} strokeWidth={Math.max(2.5, px(5))} className={cn("flex min-h-0 min-w-0", compact ? "flex-[7]" : "flex-[11]")}>
      <article
        data-testid={`screen-option-${option.slot}`}
        data-role="winner"
        data-selected="1"
        aria-label={`${SLOT_NAME[option.slot]}: ${option.label}. ${pct} percent`}
        className="cps-box cps-box-poster placed min-h-0 min-w-0 flex-1"
      >
        <div className="absolute z-20" style={{ right: px(compact ? 10 : 24), top: px(compact ? -12 : -34) }}>
          <Ribbon kind="canon" boil delayMs={RIBBON_DELAY_MS} style={bannerStyle(px(compact ? 14 : 38))} />
        </div>
        <div data-testid="screen-outcome" className={cn("flex h-full min-h-0 flex-col", compact ? "p-[0.7em]" : "p-[1.1em]")}>
          <div className={cn("flex items-center", compact ? "gap-[0.5em]" : "gap-[0.7em]")}>
            <OptionBadge slot={option.slot} size={compact ? 30 : 76} />
            <span className={cn("font-display leading-none tabular-nums", compact ? "text-[1.1em]" : "text-[2.3em]")}>{pct}%</span>
            {option.boosted ? <BoostedTag /> : null}
          </div>
          <h3 className={cn("leading-[1.08] text-balance", compact ? "mt-[0.3em] line-clamp-2 text-[0.95em]" : "mt-[0.5em] line-clamp-2 text-[1.6em]")}>{option.label}</h3>
          <div className={cn("flex min-h-0 flex-1 flex-col", compact ? "mt-[0.3em]" : "mt-[0.55em]")}>
            <Narration text={outcome?.narration ?? null} landed={landed} />
          </div>
          <Byline credit={credit} more={more} />
        </div>
      </article>
    </PenLoop>
  );
}

function LoserBox({ option, pct, side }: { option: PublicOption; pct: number; side: -1 | 1 }) {
  const { compact } = useStage();
  const common = {
    "data-testid": `screen-option-${option.slot}`,
    "data-role": "loser",
    "aria-label": `${SLOT_NAME[option.slot]}: ${option.label}. ${pct} percent`,
  } as const;
  if (compact) {
    return (
      <article {...common} className="cps-note cps-box-grey min-h-0 flex-[0.65]">
        <div className="flex h-full items-center gap-[0.5em] px-[0.5em]">
          <OptionBadge slot={option.slot} size={24} />
          <span className="font-display text-[0.8em] tabular-nums">{pct}%</span>
          <span className="line-clamp-1 min-w-0 flex-1 text-[0.68em]">{option.label}</span>
        </div>
      </article>
    );
  }
  return (
    <article
      {...common}
      style={{ ...tiltStyle(side * 1.2), ["--placed-delay" as string]: "120ms" }}
      className={cn("cps-box cps-box-grey placed min-w-0 flex-[3] self-center", side === 1 && "cps-box-alt")}
    >
      <div className="flex flex-col items-center gap-[0.45em] px-[0.6em] py-[0.9em] text-center">
        <OptionBadge slot={option.slot} size={56} />
        <span className="font-display text-[1.9em] leading-none tabular-nums">{pct}%</span>
        <p className="line-clamp-6 leading-[1.25] text-balance">{option.label}</p>
      </div>
    </article>
  );
}

export function RevealView({ state }: { state: PublicState }) {
  const { compact, metrics, px } = useStage();
  const options = state.options ?? [];
  const pcts = percentages(options.map((o) => o.id), state.tally);
  const leader = leaderId(options, state.tally);
  const winner = winnerOf(state) ?? options.find((o) => o.id === leader) ?? null;
  const losers = options.filter((o) => o.id !== winner?.id);

  return (
    <div className="absolute inset-0 flex flex-col" style={{ paddingInline: px(metrics.padX), paddingBottom: px(compact ? 22 : 36) }}>
      <div className="flex shrink-0 items-start justify-between" style={{ height: px(compact ? 32 : 130), gap: px(compact ? 8 : 24), paddingTop: px(compact ? 2 : 4) }}>
        <h2 className="m-0 leading-none">
          <NumberBanner n={state.roundNo} label={SCREEN_COPY.reveal.winner} play style={bannerStyle(px(compact ? 17 : 40))} />
        </h2>
        {allNarrator(options) ? <QuietPill /> : null}
        <span aria-hidden="true" className="shrink-0" style={{ width: px(compact ? 40 : 88) }} />
      </div>

      <div className={cn("flex min-h-0 flex-1", compact ? "flex-col" : "flex-row")} style={{ gap: px(compact ? 8 : 40), paddingInline: px(compact ? 4 : 14), paddingTop: px(compact ? 24 : 14) }}>
        {options.length === 0 ? (
          <p className="cps-slip m-auto flex items-center gap-[0.5em] px-[0.9em] py-[0.4em] text-[1.4em]">
            <Pause aria-hidden="true" className="size-[1em]" />
            {COPY.states.paused.body}
          </p>
        ) : null}
        {!compact && losers[0] ? <LoserBox option={losers[0]} pct={pcts[losers[0].id] ?? 0} side={-1} /> : null}
        {winner ? <WinnerPage key={winner.id} option={winner} pct={pcts[winner.id] ?? 0} outcome={state.outcome} /> : null}
        {!compact && losers[1] ? <LoserBox option={losers[1]} pct={pcts[losers[1].id] ?? 0} side={1} /> : null}
        {compact ? losers.map((o) => <LoserBox key={o.id} option={o} pct={pcts[o.id] ?? 0} side={1} />) : null}
      </div>
    </div>
  );
}
