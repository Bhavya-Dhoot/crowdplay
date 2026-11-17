"use client";
// VOTE body: three full-width paper script cards, 12 px apart (design-v2). Each card is one <button>: a gel band on
// top, the lettered GelDisc (never colour alone), the option in the script voice, a live bar with the percentage and
// the supporter line. A tap selects it (haptic tap), shows the check and "Your vote", and can be changed until the
// timer ends. The wildcard wears a WILDCARD stamp, a narrator's pick the narrator stamp. Your own idea gets a gold edge
// and a "Yours" chip. Toasts sit at the top during VOTE (PlayerView); when my idea is on the ballot a lane above the
// cards (ballotIdea) is where the gold "on the ballot" toast lands, so no toast ever covers a card (audit #5).
import { Check, Sparkles } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { GelDisc, gelOf } from "@/components/ui/GelDisc";
import { haptic } from "@/components/ui/motionTokens";
import { paperCardClass } from "@/components/ui/PaperCard";
import { Stamp } from "@/components/ui/Stamp";
import type { PublicOption, PublicState } from "@/lib/realtime/types";
import { optionAria, optionFlags, supportLine, votePercent, voteShare } from "./logic";
import { PLAY_COPY } from "./playCopy";
import styles from "./play.module.css";

const GEL_VAR = { A: "var(--gel-a)", B: "var(--gel-b)", C: "var(--gel-c)" } as const;

type Props = {
  options: PublicOption[];
  tally: PublicState["tally"];
  votesTotal: number | undefined;
  selectedId: string | null;
  mineIds: string[];
  /** My idea's text once the "on the ballot" receipt arrived: a lane above the cards that the gold toast lands on. */
  ballotIdea: string | null;
  disabled: boolean;
  label: (o: PublicOption) => string;
  onVote: (optionId: string) => void;
};

export function VoteView({ options, tally, votesTotal, selectedId, mineIds, ballotIdea, disabled, label, onVote }: Props) {
  const ordered = [...options].sort((a, b) => a.slot.localeCompare(b.slot));
  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="flex h-9 shrink-0 items-center justify-between gap-3 text-fine text-muted-on-stage">
        <span className="min-w-0 truncate">{selectedId ? PLAY_COPY.play.vote.hintVoted : PLAY_COPY.play.vote.hint}</span>
        <span data-testid="votes-total" className="shrink-0 tabular-nums">
          {PLAY_COPY.play.vote.votes(votesTotal ?? 0)}
        </span>
      </p>
      {ballotIdea ? (
        <p data-testid="ballot-lane" className="mt-1 flex h-11 shrink-0 items-center gap-2 rounded-element border border-stage-line bg-stage-1 px-3 text-small text-on-stage">
          <Sparkles aria-hidden="true" className="size-4 shrink-0 text-gold" />
          <span className="shrink-0 font-semibold">{PLAY_COPY.play.vote.yours}</span>
          <span className="min-w-0 truncate text-muted-on-stage">“{ballotIdea}”</span>
        </p>
      ) : null}
      <div
        role="group"
        aria-label={PLAY_COPY.play.vote.heading}
        className="-mx-1 grid min-h-0 flex-1 auto-rows-[minmax(124px,196px)] grid-cols-1 content-start gap-3 overflow-y-auto overscroll-contain px-1 pt-3 pb-[var(--dock-pad,8px)]"
      >
        {ordered.map((o) => {
          const flags = optionFlags(o);
          const selected = selectedId === o.id;
          const mine = mineIds.includes(o.id);
          const pct = votePercent(tally, votesTotal, o.id);
          const share = voteShare(tally, votesTotal, o.id);
          const text = label(o);
          const support = supportLine(o);
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={selected}
              data-testid={`option-${o.slot}`}
              data-selected={selected ? "1" : undefined}
              data-mine={mine ? "1" : undefined}
              aria-label={optionAria(o, text, pct, selected, mine)}
              disabled={disabled}
              onClick={() => {
                if (!selected) haptic("tap");
                onVote(o.id);
              }}
              className={paperCardClass({
                gel: gelOf(o.slot),
                edge: mine ? "gold" : flags.wildcard ? "wild" : undefined,
                pressable: true,
                className: cn(
                  "flex flex-col justify-center px-3.5 pt-5 pb-3.5 text-left text-ink",
                  "disabled:pointer-events-none",
                  selected && "shadow-[0_0_0_3px_var(--light),var(--paper-highlight),var(--contact-shadow)]",
                ),
              })}
            >
              {flags.wildcard ? <Stamp kind="wildcard" size="sm" delayMs={250} className="absolute -top-2.5 right-3 z-10" /> : null}
              {flags.narrator ? <Stamp kind="narrator" size="sm" delayMs={250} className="absolute -top-2.5 right-3 z-10" /> : null}
              <span className="flex items-start gap-3">
                <GelDisc letter={o.slot} size={40} />
                <span className="flex min-w-0 flex-1 flex-col gap-2.5">
                  <span className="pt-0.5 font-script text-[20px] leading-[1.25] font-semibold break-words">
                    <span className="line-clamp-3">{text}</span>
                  </span>
                  <span className="flex items-center gap-3" aria-hidden="true">
                    <span className="relative h-2.5 flex-1 overflow-hidden rounded-pill bg-ink/10">
                      <span
                        className="absolute inset-0 origin-left rounded-pill transition-transform duration-300 ease-arrive motion-reduce:transition-none"
                        style={{ background: GEL_VAR[o.slot], transform: `scaleX(${share})` }}
                      />
                    </span>
                    <span className="w-11 text-right font-display text-lead leading-none font-extrabold tabular-nums">{pct}%</span>
                  </span>
                  <span aria-hidden="true" className="flex min-h-6 items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 text-fine text-ink-muted">
                      {support ? <span className="truncate">{support}</span> : null}
                      {flags.boosted ? <span className="shrink-0 rounded-pill bg-gel-c px-2 py-0.5 font-semibold text-ink">{PLAY_COPY.play.vote.boosted}</span> : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {mine ? (
                        <span className="inline-flex items-center gap-1 rounded-pill bg-gold px-2 py-0.5 text-fine font-bold text-ink">
                          <Sparkles aria-hidden="true" className="size-3.5" />
                          {PLAY_COPY.play.vote.yours}
                        </span>
                      ) : null}
                      {selected ? (
                        <span className={cn("inline-flex items-center gap-1 rounded-pill bg-ink px-2 py-0.5 text-fine font-bold text-paper", styles.chipIn)}>
                          <Check aria-hidden="true" className="size-3.5" strokeWidth={3.5} />
                          {PLAY_COPY.play.vote.yourVote}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
