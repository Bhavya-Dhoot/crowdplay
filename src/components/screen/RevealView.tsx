"use client";
// REVEAL: the winner is a big paper script page in the middle. The CANON stamp slams on it once (the 975 ms
// moment: the page lifts, the stamp lands, then the narration is typed in the script voice). The other two
// options shrink to small cards on either side but keep text of 28 px and up. The byline closes the page.
import { Pause } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/components/ui/cn";
import { gelOf } from "@/components/ui/GelDisc";
import { m } from "@/components/ui/motion";
import { SPRING } from "@/components/ui/motionTokens";
import { paperCardClass } from "@/components/ui/PaperCard";
import { ScriptText } from "@/components/ui/ScriptText";
import { Stamp } from "@/components/ui/Stamp";
import { COPY, creditLine } from "@/lib/copy";
import type { PublicOption, PublicState } from "@/lib/realtime/types";
import { SCREEN_COPY } from "./copy";
import { QuietPill } from "./optionParts";
import { allNarrator, leaderId, narrationPx, percentages, SLOT_NAME, winnerOf } from "./reveal";
import { CreditAvatars, OptionBadge, Tag, TypingDots, useStage } from "./stage";

/** When the stamp has landed: the lift (about 340 ms) plus the stamp's own spring. */
const STAMP_DELAY_MS = 340;
const LANDED_MS = 975;

function Narration({ text, landed }: { text: string | null; landed: boolean }) {
  const { compact, px } = useStage();
  if (!text || !text.trim()) {
    return (
      <p className={cn("flex items-center font-semibold text-ink-muted", compact ? "text-[0.65em]" : "text-[1.2em]")}>
        {SCREEN_COPY.reveal.writing}
        <TypingDots />
      </p>
    );
  }
  const size = narrationPx(text) * (compact ? 0.6 : 1);
  return (
    <div className="min-h-0 overflow-hidden" data-testid="narration" style={{ fontSize: px(size) }}>
      <ScriptText text={text} as="p" play={landed} cps={Math.min(90, Math.max(34, Math.round(text.length / 5.5)))} className="text-[1em] leading-[1.36] font-medium text-ink" />
    </div>
  );
}

function Byline({ credit, more }: { credit: PublicOption["credit"]; more: number }) {
  const { compact } = useStage();
  const line = creditLine(credit, more);
  // creditLine owns the wording ("+ N others"); names are re-drawn below so a name never breaks across lines.
  const extra = line.slice(creditLine(credit, 0).length).replace(/^ /, "");
  return (
    <div data-testid="screen-credits" className={cn("flex items-center border-t-[0.06em] border-paper-edge", compact ? "mt-[0.3em] gap-[0.5em] pt-[0.35em]" : "mt-[0.5em] gap-[0.8em] pt-[0.6em]")}>
      <CreditAvatars credit={credit} size={compact ? 24 : 60} />
      <p className={cn("min-w-0 font-semibold text-ink", compact ? "line-clamp-1 text-[0.6em]" : "line-clamp-2 text-[1.15em] leading-tight text-balance")}>
        {line ? (
          <>
            <span className="font-medium text-ink-muted">{SCREEN_COPY.reveal.credit} </span>
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
    <m.article
      data-testid={`screen-option-${option.slot}`}
      data-role="winner"
      data-selected="1"
      aria-label={`${SLOT_NAME[option.slot]}: ${option.label}. ${pct} percent`}
      initial={{ opacity: 0, y: compact ? 16 : 56, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={SPRING.lift}
      className={paperCardClass({ gel: gelOf(option.slot), className: cn("min-h-0 min-w-0", compact ? "flex-[7] rounded-[0.5em]" : "flex-[11] rounded-[0.7em]") })}
    >
      <Stamp
        kind="canon"
        delayMs={STAMP_DELAY_MS}
        className={cn("absolute z-20", compact ? "-top-[0.25em] right-[0.5em]" : "-top-[0.55em] right-[0.9em]")}
        style={{ ["--stamp-size" as string]: `${px(compact ? 14 : 70)}px` }}
      />
      <div data-testid="screen-outcome" className={cn("relative z-10 flex h-full min-h-0 flex-col", compact ? "p-[0.7em]" : "p-[1.1em]")}>
        <div className={cn("flex items-center", compact ? "gap-[0.5em]" : "gap-[0.7em]")}>
          <OptionBadge slot={option.slot} size={compact ? 30 : 76} />
          <span className={cn("font-display leading-none font-extrabold tabular-nums text-ink", compact ? "text-[1.1em]" : "text-[2.3em]")}>{pct}%</span>
          {option.boosted ? <Tag tone="outline">⚡ boosted in demo</Tag> : null}
        </div>
        <h3 className={cn("font-display leading-[1.08] font-extrabold text-balance text-ink", compact ? "mt-[0.3em] line-clamp-2 text-[0.95em]" : "mt-[0.5em] line-clamp-2 text-[1.6em]")}>{option.label}</h3>
        <div className={cn("flex min-h-0 flex-1 flex-col", compact ? "mt-[0.3em]" : "mt-[0.55em]")}>
          <Narration text={outcome?.narration ?? null} landed={landed} />
        </div>
        <Byline credit={credit} more={more} />
      </div>
    </m.article>
  );
}

function LoserCard({ option, pct, side }: { option: PublicOption; pct: number; side: -1 | 1 }) {
  const { compact } = useStage();
  const common = {
    "data-testid": `screen-option-${option.slot}`,
    "data-role": "loser",
    "aria-label": `${SLOT_NAME[option.slot]}: ${option.label}. ${pct} percent`,
  } as const;
  if (compact) {
    return (
      <m.article
        {...common}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={paperCardClass({ tone: "paper-2", gel: gelOf(option.slot), className: "min-h-0 flex-[0.65] rounded-[0.5em]" })}
      >
        <div className="relative z-10 flex h-full items-center gap-[0.5em] px-[0.5em] pt-[0.2em]">
          <OptionBadge slot={option.slot} size={22} />
          <span className="font-display text-[0.8em] font-extrabold tabular-nums text-ink">{pct}%</span>
          <span className="line-clamp-1 min-w-0 flex-1 text-[0.62em] text-ink">{option.label}</span>
        </div>
      </m.article>
    );
  }
  return (
    <m.article
      {...common}
      initial={{ opacity: 0, x: side * 70, scale: 1.1 }}
      animate={{ opacity: 1, x: 0, scale: 0.97 }}
      transition={{ ...SPRING.settle, delay: 0.12 }}
      style={{ ["--tilt" as string]: `${side * 1.2}deg` }}
      className={paperCardClass({ tone: "paper-2", gel: gelOf(option.slot), className: "min-w-0 flex-[3] self-center rounded-[0.6em]" })}
    >
      <div className="relative z-10 flex flex-col items-center gap-[0.45em] px-[0.6em] py-[0.9em] text-center">
        <OptionBadge slot={option.slot} size={56} />
        <span className="font-display text-[1.9em] leading-none font-extrabold tabular-nums text-ink">{pct}%</span>
        <p className="line-clamp-6 text-[1em] leading-[1.25] font-semibold text-balance text-ink">{option.label}</p>
      </div>
    </m.article>
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
    <div className="absolute inset-0 flex flex-col" style={{ paddingInline: px(metrics.padX), paddingBottom: px(compact ? 8 : 26) }}>
      <div className="flex shrink-0 items-center justify-between" style={{ height: px(compact ? 30 : 108), gap: px(compact ? 8 : 24) }}>
        <h2 className={cn("font-display font-extrabold", compact ? "text-[0.8em]" : "text-[1.9em]")}>{SCREEN_COPY.reveal.winner}</h2>
        {allNarrator(options) ? <QuietPill /> : null}
        <span aria-hidden="true" className="shrink-0" style={{ width: px(compact ? 40 : 88) }} />
      </div>

      <div className={cn("flex min-h-0 flex-1", compact ? "flex-col" : "flex-row")} style={{ gap: px(compact ? 6 : 32) }}>
        {options.length === 0 ? (
          <p className="m-auto flex items-center gap-[0.5em] text-[1.4em] font-semibold text-muted-on-stage">
            <Pause aria-hidden="true" className="size-[1em]" />
            {COPY.states.paused.body}
          </p>
        ) : null}
        {!compact && losers[0] ? <LoserCard option={losers[0]} pct={pcts[losers[0].id] ?? 0} side={-1} /> : null}
        {winner ? <WinnerPage key={winner.id} option={winner} pct={pcts[winner.id] ?? 0} outcome={state.outcome} /> : null}
        {!compact && losers[1] ? <LoserCard option={losers[1]} pct={pcts[losers[1].id] ?? 0} side={1} /> : null}
        {compact ? losers.map((o) => <LoserCard key={o.id} option={o} pct={pcts[o.id] ?? 0} side={1} />) : null}
      </div>
    </div>
  );
}
