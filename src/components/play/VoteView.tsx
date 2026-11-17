"use client";
// VOTE body: three big paper boxes, 16 px apart (design-v3). Each box is one <button>: the lettered badge (never colour
// alone), the option in the note hand, a grey marker bar that rises to its share with the percentage, and the supporter
// line. A tap selects it (haptic tap): the pen circles its letter, the yellow marker fills it and the box sinks into its
// shadow, with "Your vote" under it; it can be changed until the timer ends. The wildcard wears a WILDCARD ribbon, a
// narrator's pick the narrator ribbon. Your own idea gets the yellow edge and a "Yours" tag. Toasts sit at the top
// during VOTE (PlayerView); when my idea is on the ballot a lane above the boxes (ballotIdea) shows it with the yellow
// marker swiped under it, so no toast ever covers a box (audit #5).
import { Zap } from "lucide-react";
import { useState } from "react";
import { cn } from "@/components/ui/cn";
import { LetterBadge } from "@/components/ui/LetterBadge";
import { haptic } from "@/components/ui/motionTokens";
import { paperCardClass } from "@/components/ui/PaperCard";
import { PenCheck } from "@/components/ui/PenCheck";
import { Pill } from "@/components/ui/Pill";
import { Ribbon } from "@/components/ui/Ribbon";
import { Swash } from "@/components/ui/Swash";
import type { PublicOption, PublicState } from "@/lib/realtime/types";
import { optionAria, optionFlags, supportLine, votePercent, voteShare } from "./logic";
import { PLAY_COPY } from "./playCopy";
import styles from "./play.module.css";

type Props = {
  options: PublicOption[];
  tally: PublicState["tally"];
  votesTotal: number | undefined;
  selectedId: string | null;
  mineIds: string[];
  /** My idea's text once the "on the ballot" receipt arrived: a lane above the boxes with the yellow marker under it. */
  ballotIdea: string | null;
  disabled: boolean;
  label: (o: PublicOption) => string;
  onVote: (optionId: string) => void;
};

export function VoteView({ options, tally, votesTotal, selectedId, mineIds, ballotIdea, disabled, label, onVote }: Props) {
  const ordered = [...options].sort((a, b) => a.slot.localeCompare(b.slot));
  // A vote that was already there when the screen opened (a reload) is shown drawn; only a new choice is circled live.
  const [firstVote] = useState(selectedId);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="flex h-9 shrink-0 items-center justify-between gap-3 px-1 text-fine text-ink-notes">
        <span className="min-w-0 truncate">{selectedId ? PLAY_COPY.play.vote.hintVoted : PLAY_COPY.play.vote.hint}</span>
        <span data-testid="votes-total" className="shrink-0 tabular-nums">
          {PLAY_COPY.play.vote.votes(votesTotal ?? 0)}
        </span>
      </p>
      {ballotIdea ? (
        <p data-testid="ballot-lane" className="slip mt-1 flex h-11 shrink-0 items-center gap-2 rounded-element px-3 text-body">
          <span className="shrink-0 font-display">{PLAY_COPY.play.vote.yours}</span>
          <Swash play className="min-w-0 max-w-full truncate">
            “{ballotIdea}”
          </Swash>
        </p>
      ) : null}
      <div
        role="group"
        aria-label={PLAY_COPY.play.vote.heading}
        className="-mx-2 grid min-h-0 flex-1 auto-rows-auto grid-cols-1 content-stretch gap-4 overflow-y-auto overscroll-contain px-2 pt-4 pb-[var(--dock-pad,8px)]"
      >
        {ordered.map((o, i) => {
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
                edge: mine ? "gold" : undefined,
                pressable: true,
                alt: i % 2 === 1,
                className: cn(
                  "flex flex-col justify-center px-4 py-3.5 text-left text-ink",
                  "disabled:pointer-events-none",
                  flags.wildcard && "border-dashed",
                  selected && styles.picked,
                  selected && mine && styles.pickedMine,
                ),
              })}
            >
              {flags.wildcard ? <Ribbon kind="wildcard" size="sm" className="absolute -top-4 right-2 z-10" /> : null}
              {flags.narrator ? <Ribbon kind="narrator" size="sm" className="absolute -top-4 right-2 z-10" /> : null}
              <span className="flex items-start gap-3">
                <LetterBadge letter={o.slot} size={44} selected={selected} animate={selectedId !== firstVote} className="mt-0.5" />
                <span className="flex min-w-0 flex-1 flex-col gap-2.5">
                  <span className="text-lead leading-[1.25] break-words">
                    <span className="line-clamp-3">{text}</span>
                  </span>
                  <span className="flex items-center gap-3" aria-hidden="true">
                    <span className="relative h-3.5 flex-1 overflow-hidden rounded-pill border-2 border-ink bg-paper">
                      <span
                        className="bar-fill-grey absolute inset-0 transition-[clip-path] duration-[410ms] ease-arrive motion-reduce:transition-none"
                        style={{ clipPath: `inset(0 ${Math.round((1 - share) * 1000) / 10}% 0 0)` }}
                      />
                    </span>
                    <span className="w-12 text-right font-display text-lead leading-none tabular-nums">{pct}%</span>
                  </span>
                  <span aria-hidden="true" className="flex min-h-6 items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 text-fine text-ink-notes">
                      {support ? <span className="truncate">{support}</span> : null}
                      {flags.boosted ? (
                        <Pill size="sm" className="shrink-0">
                          <Zap aria-hidden="true" className="size-3.5" fill="currentColor" />
                          {PLAY_COPY.play.vote.boosted}
                        </Pill>
                      ) : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-2 font-display text-fine leading-none text-ink">
                      {mine ? <Swash>{PLAY_COPY.play.vote.yours}</Swash> : null}
                      {selected ? (
                        <span className="inline-flex items-center gap-1">
                          <PenCheck size={16} seed={o.id} play={selectedId !== firstVote} />
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
