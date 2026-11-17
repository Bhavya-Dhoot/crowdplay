"use client";
// REVEAL body (design-v2): the winner card lifts in, the CANON stamp lands on it, a one-line result says what it meant
// for me ("You called it", "Your idea got 23%"), the narration types onto a paper script page and the byline under it
// names the people behind it ("Written by @a, @b + N others"). The losing options sit quietly below with their final %.
// One confetti burst for everyone else; if my own idea won, the gold canon moment does the bursting instead.
import { Check, Trophy } from "lucide-react";
import { useEffect, useRef } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/components/ui/cn";
import { GelDisc, gelOf } from "@/components/ui/GelDisc";
import { m } from "@/components/ui/motion";
import { SPRING } from "@/components/ui/motionTokens";
import { PaperCard } from "@/components/ui/PaperCard";
import { ScriptText } from "@/components/ui/ScriptText";
import { Skeleton } from "@/components/ui/Skeleton";
import { Stamp } from "@/components/ui/Stamp";
import { creditLine } from "@/lib/copy";
import type { PublicOption, PublicState } from "@/lib/realtime/types";
import { resultChips, votePercent, type ResultChip } from "./logic";
import { PLAY_COPY } from "./playCopy";

type Props = {
  state: PublicState;
  narration: string | null;
  label: (o: PublicOption) => string;
  mineIds: string[];
  votedId: string | null;
  reduced: boolean;
};

const CONFETTI = ["#FFC83D", "#4C7DFF", "#22C58B", "#FF3D7F", "#F6F0E4"];

async function burst(reduced: boolean): Promise<void> {
  if (reduced) return;
  const { default: confetti } = await import("canvas-confetti");
  void confetti({ particleCount: 70, spread: 75, startVelocity: 38, origin: { x: 0.5, y: 0.42 }, colors: CONFETTI, disableForReducedMotion: true, ticks: 160 });
}

function Chip({ chip }: { chip: ResultChip }) {
  const canon = chip.kind === "canon";
  return (
    <span
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 rounded-pill px-3 text-small font-semibold",
        canon ? "bg-gold text-ink" : chip.kind === "called" ? "bg-paper text-ink" : "border border-stage-line bg-stage-2 text-on-stage",
      )}
    >
      {canon ? <Trophy aria-hidden="true" className="size-4" /> : chip.kind === "called" ? <Check aria-hidden="true" className="size-4" strokeWidth={3} /> : null}
      {chip.text}
    </span>
  );
}

export function RevealView({ state, narration, label, mineIds, votedId, reduced }: Props) {
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

  const burstFor = useRef("");
  useEffect(() => {
    const key = `${state.roundNo}:${winnerId}`;
    if (!winnerId || mine || burstFor.current === key) return;
    burstFor.current = key;
    void burst(reduced);
  }, [winnerId, mine, state.roundNo, reduced]);

  return (
    <div className="h-full overflow-y-auto overscroll-contain px-0.5 pt-3 pb-[var(--dock-pad,8px)]">
      {winner ? (
        <m.div
          key={winner.id}
          initial={{ opacity: 0, y: 28, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={SPRING.lift}
        >
          <PaperCard
            data-testid="winner"
            gel={gelOf(winner.slot)}
            edge={mine ? "gold" : undefined}
            className="px-4 pt-6 pb-4"
          >
            <Stamp kind="canon" size="md" delayMs={reduced ? 0 : 420} className="absolute -top-3 right-3 z-10" />
            <p className="text-fine text-ink-muted">{PLAY_COPY.play.reveal.picked}</p>
            <div className="mt-2 flex items-start gap-3">
              <GelDisc letter={winner.slot} size={44} />
              <div className="min-w-0 flex-1">
                <h2 className="font-script text-[24px] leading-[1.18] font-semibold tracking-normal break-words text-ink">{label(winner)}</h2>
                <p className="mt-1 text-small font-semibold text-ink-muted tabular-nums">{PLAY_COPY.play.reveal.pct(pct)}</p>
              </div>
            </div>
          </PaperCard>
        </m.div>
      ) : (
        <div className="rounded-card border border-stage-line bg-stage-1 p-4" role="status">
          <p className="font-display text-lead font-bold">The crowd has decided…</p>
        </div>
      )}

      {chips.length > 0 ? (
        <m.div
          data-testid="reveal-result"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduced ? 0 : 0.95, duration: 0.41, ease: [0.24, 1, 0.4, 1] }}
          className="mt-3 flex flex-wrap gap-2"
        >
          {chips.map((c) => (
            <Chip key={c.kind} chip={c} />
          ))}
        </m.div>
      ) : null}

      <PaperCard as="section" aria-label="The narration" className="mt-4 px-5 py-4">
        <div className="min-h-[96px]">
          {text ? (
            <div data-testid="narration">
              <ScriptText text={text} cps={36} delayMs={reduced ? 0 : 700} className="text-[18px] leading-[1.6] text-ink" />
            </div>
          ) : (
            <div data-testid="narration-pending" role="status" className="space-y-2.5">
              <span className="sr-only">{PLAY_COPY.play.reveal.narrator}</span>
              <Skeleton tone="paper" className="h-4 w-full" />
              <Skeleton tone="paper" className="h-4 w-[92%]" />
              <Skeleton tone="paper" className="h-4 w-2/3" />
            </div>
          )}
        </div>

        {credit.length > 0 || more > 0 ? (
          <div data-testid="credits" className="mt-4 flex items-center gap-3 border-t border-dashed border-paper-edge pt-3">
            <span aria-hidden="true" className="flex shrink-0 -space-x-2">
              {credit.slice(0, 3).map((c) => (
                <Avatar key={c.name} name={c.name} size={28} className="ring-2 ring-paper" />
              ))}
            </span>
            <p className="min-w-0 font-script text-small leading-snug break-words text-ink">
              <span className="text-ink-muted">{PLAY_COPY.play.reveal.credits} </span>
              <span className="font-semibold">{creditLine(credit, more)}</span>
            </p>
          </div>
        ) : null}
      </PaperCard>

      {losers.length > 0 ? (
        <section aria-label={PLAY_COPY.play.reveal.lost} className="mt-4 space-y-2">
          {losers.map((o, i) => (
            <m.div
              key={o.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.41, delay: 0.5 + i * 0.12 }}
              className="flex items-center gap-3 rounded-card border border-stage-line bg-stage-1 px-3 py-2.5"
            >
              <GelDisc letter={o.slot} size={28} />
              <p className="line-clamp-2 min-w-0 flex-1 font-script text-small leading-snug text-muted-on-stage">{label(o)}</p>
              <span className="font-display text-body font-extrabold tabular-nums text-on-stage">{votePercent(state.tally, state.votesTotal, o.id)}%</span>
            </m.div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
