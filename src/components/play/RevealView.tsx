"use client";
// REVEAL body (design-v3): the winner's box is placed, the pen draws a yellow loop around it, the CANON ribbon is written
// in, one burst of doodle confetti follows; a one-line result says what it meant for me ("You called it", "Your idea is
// canon", with the yellow marker under it), the narration is written onto a note by the pen (ScriptText) and the
// byline under it names the people behind it ("Written by @a, @b + N others"). The losing options sit quietly below,
// dashed, with their final %. One burst for everyone else; if my own idea won, the full-phone canon moment bursts too.
// Reduced motion: loop, ribbon and result appear complete, no confetti, the narration shows at once.
import { useEffect } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/components/ui/cn";
import { tiltOf } from "@/components/ui/doodle";
import { fireDoodleConfetti } from "@/components/ui/doodleConfetti";
import { LetterBadge } from "@/components/ui/LetterBadge";
import { PaperCard } from "@/components/ui/PaperCard";
import { PenCheck } from "@/components/ui/PenCheck";
import { PenLoop } from "@/components/ui/PenLoop";
import { Ribbon } from "@/components/ui/Ribbon";
import { ScriptText } from "@/components/ui/ScriptText";
import { Skeleton } from "@/components/ui/Skeleton";
import { Swash } from "@/components/ui/Swash";
import { creditLine } from "@/lib/copy";
import type { PublicOption, PublicState } from "@/lib/realtime/types";
import { resultChips, votePercent, type ResultChip } from "./logic";
import { PLAY_COPY } from "./playCopy";
import styles from "./play.module.css";

type Props = {
  state: PublicState;
  narration: string | null;
  label: (o: PublicOption) => string;
  mineIds: string[];
  votedId: string | null;
};

// When the pen starts each part (ms): the loop, the ribbon, the burst (once the loop is closed), the result, the narration.
const LOOP_AT = 250;
const RIBBON_AT = 700;
const BURST_AT = 1000;
const RESULT_AT = 1200;
const NARRATION_AT = 1300;
const LONG_LABEL = 70;

function ResultLine({ chip, at }: { chip: ResultChip; at: number }) {
  if (chip.kind === "mine") return <p className="text-body text-ink-notes">{chip.text}</p>;
  return (
    <p className="flex items-center gap-2 font-display text-lead leading-snug">
      <PenCheck size={22} delayMs={at} seed={chip.kind} />
      <Swash play delayMs={at}>
        {chip.text}
      </Swash>
    </p>
  );
}

export function RevealView({ state, narration, label, mineIds, votedId }: Props) {
  const options = state.options ?? [];
  const outcome = state.outcome;
  const winner = options.find((o) => o.id === outcome?.optionId);
  const losers = options.filter((o) => o.id !== winner?.id).sort((a, b) => a.slot.localeCompare(b.slot));
  const text = narration ?? "";
  const pct = winner ? votePercent(state.tally, state.votesTotal, winner.id) : 0;
  const mine = winner ? mineIds.includes(winner.id) : false;
  const credit = outcome?.credit ?? [];
  const more = outcome?.more ?? 0;
  const winnerId = winner?.id;
  const chips = resultChips({ winnerId, votedId, mineIds, tally: state.tally, total: state.votesTotal });
  const winnerText = winner ? label(winner) : "";

  // One burst per round, a moment after the loop closes (the helper does nothing under reduced motion). When my own idea
  // won, the canon moment bursts instead. The timer is re-armed on every run so development's double effect still fires once.
  useEffect(() => {
    if (!winnerId || mine) return;
    const t = setTimeout(() => void fireDoodleConfetti({ origin: { x: 0.5, y: 0.4 } }), BURST_AT);
    return () => clearTimeout(t);
  }, [winnerId, mine, state.roundNo]);

  return (
    <div className="h-full overflow-y-auto overscroll-contain px-3.5 pt-6 pb-[var(--dock-pad,8px)]">
      {winner ? (
        <div key={winner.id} className="relative">
          <PenLoop tone="yellow" boil shape="round" delayMs={LOOP_AT} seed={winner.id} className="block">
            <PaperCard data-testid="winner" edge={mine ? "gold" : undefined} className="placed block px-4 pt-7 pb-4">
              <p className="text-fine text-ink-notes">{PLAY_COPY.play.reveal.picked}</p>
              <div className="mt-2 flex items-start gap-3">
                <LetterBadge letter={winner.slot} size={44} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <h2 className={cn("font-display leading-tight break-words", winnerText.length > LONG_LABEL ? "text-lead" : "text-h3")}>{winnerText}</h2>
                  <p className="mt-1 text-body text-ink-notes tabular-nums">{PLAY_COPY.play.reveal.pct(pct)}</p>
                </div>
              </div>
            </PaperCard>
          </PenLoop>
          {/* Outside the loop's wrapper, so the ribbon is pinned on top of the pen line instead of being crossed by it. */}
          <Ribbon kind="canon" size="md" delayMs={RIBBON_AT} className="absolute -top-5 right-1 z-20" />
        </div>
      ) : (
        <div className="slip rounded-card p-4" role="status">
          <p className="font-display text-lead">The crowd has decided…</p>
        </div>
      )}

      {chips.length > 0 ? (
        <div data-testid="reveal-result" className="mt-6 flex flex-col gap-2 px-1">
          {chips.map((c) => (
            <ResultLine key={c.kind} chip={c} at={RESULT_AT} />
          ))}
        </div>
      ) : null}

      <PaperCard
        as="section"
        aria-label="The narration"
        tone="paper-2"
        tilt={tiltOf(`narration-${state.roundNo}`, 0.8)}
        className={cn("mt-7 rounded-card px-5 py-4", styles.tape)}
      >
        <div className="min-h-[96px]">
          {text ? (
            <div data-testid="narration">
              <ScriptText text={text} cps={36} delayMs={NARRATION_AT} className="text-body leading-[1.65] text-ink" />
            </div>
          ) : (
            <div data-testid="narration-pending" role="status" className="space-y-2.5">
              <span className="sr-only">{PLAY_COPY.play.reveal.narrator}</span>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-[92%]" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          )}
        </div>

        {credit.length > 0 || more > 0 ? (
          <div data-testid="credits" className="mt-4 flex items-center gap-3 border-t-2 border-dashed border-ink-faint pt-3">
            <span aria-hidden="true" className="flex shrink-0 -space-x-2">
              {credit.slice(0, 3).map((c) => (
                <Avatar key={c.name} name={c.name} size={30} className="ring-2 ring-paper-raised" />
              ))}
            </span>
            <p className="min-w-0 text-body leading-snug break-words text-ink">
              <span className="text-ink-notes">{PLAY_COPY.play.reveal.credits} </span>
              <span>{creditLine(credit, more)}</span>
            </p>
          </div>
        ) : null}
      </PaperCard>

      {losers.length > 0 ? (
        <section aria-label={PLAY_COPY.play.reveal.lost} className="mt-7 space-y-3">
          {losers.map((o, i) => (
            <div
              key={o.id}
              className="placed flex items-center gap-3 rounded-element border-2 border-dashed border-ink-faint bg-paper-raised px-3 py-2.5"
              style={{ ["--placed-delay" as string]: `${500 + i * 120}ms` }}
            >
              <LetterBadge letter={o.slot} size={30} />
              <p className="line-clamp-2 min-w-0 flex-1 text-body leading-snug text-ink-notes">{label(o)}</p>
              <span className="font-display text-body tabular-nums text-ink">{votePercent(state.tally, state.votesTotal, o.id)}%</span>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
