"use client";
// VOTE body: three big option cards. Letter + icon + label, never colour alone. Tap selects (the
// hook buzzes), the vote can change until the timer ends. Bars follow the live tally.
import { Check, Sparkles, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { Pill } from "@/components/ui/Pill";
import { COPY } from "@/lib/copy";
import type { OptionSlot, PublicOption, PublicState } from "@/lib/realtime/types";
import { optionAria, optionFlags, supportLine, votePercent, voteShare } from "./logic";
import { PLAY_COPY } from "./playCopy";

const BADGE: Record<OptionSlot, string> = { A: "bg-opt-a", B: "bg-opt-b", C: "bg-opt-c" };
const FILL: Record<OptionSlot, string> = { A: "bg-opt-a", B: "bg-opt-b", C: "bg-opt-c" };

type Props = {
  options: PublicOption[];
  tally: PublicState["tally"];
  votesTotal: number | undefined;
  selectedId: string | null;
  mineIds: string[];
  disabled: boolean;
  label: (o: PublicOption) => string;
  onVote: (optionId: string) => void;
};

export function OptionBadge({ slot, size = 40 }: { slot: OptionSlot; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className={cn("relative grid shrink-0 place-items-center rounded-full font-display font-extrabold text-ink", BADGE[slot])}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
    >
      {slot}
      {slot === "C" ? (
        <span className="absolute -right-1 -bottom-1 grid size-[45%] place-items-center rounded-full bg-bg text-wild">
          <Zap className="size-[70%]" strokeWidth={3} fill="currentColor" />
        </span>
      ) : null}
    </span>
  );
}

export function VoteView({ options, tally, votesTotal, selectedId, mineIds, disabled, label, onVote }: Props) {
  const ordered = [...options].sort((a, b) => a.slot.localeCompare(b.slot));
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <p className="flex h-6 shrink-0 items-center justify-between text-sm text-muted">
        <span>{PLAY_COPY.play.vote.heading}</span>
        <span data-testid="votes-total" className="tabular-nums">{PLAY_COPY.play.vote.votes(votesTotal ?? 0)}</span>
      </p>
      <div role="group" aria-label={PLAY_COPY.play.vote.heading} className="grid min-h-0 flex-1 auto-rows-fr grid-cols-1 gap-2.5 overflow-y-auto overscroll-contain">
        {ordered.map((o) => {
          const flags = optionFlags(o);
          const selected = selectedId === o.id;
          const mine = mineIds.includes(o.id);
          const pct = votePercent(tally, votesTotal, o.id);
          const share = voteShare(tally, votesTotal, o.id);
          const text = label(o);
          const support = supportLine(o);
          const tags: ReactNode[] = [];
          if (flags.wildcard) tags.push(<Pill key="w" tone="wild" size="sm"><Zap aria-hidden="true" className="size-3" strokeWidth={3} />{PLAY_COPY.play.vote.wildcard}</Pill>);
          if (flags.narrator) tags.push(<Pill key="n" tone="neutral" size="sm">{COPY.reveal.narratorPick}</Pill>);
          if (flags.boosted) tags.push(<Pill key="b" tone="wild" size="sm">{PLAY_COPY.play.vote.boosted}</Pill>);
          if (selected) tags.push(<Pill key="s" tone="accent" size="sm"><Check aria-hidden="true" className="size-3" strokeWidth={3.5} />{PLAY_COPY.play.vote.yourVote}</Pill>);
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
              onClick={() => onVote(o.id)}
              className={cn(
                "relative flex min-h-[104px] flex-col justify-center gap-2.5 overflow-hidden rounded-card border-2 p-3.5 text-left",
                "transition-[transform,border-color,background-color,box-shadow] duration-200 active:scale-[0.985] disabled:active:scale-100 motion-reduce:transition-none motion-reduce:active:scale-100",
                selected
                  ? "border-accent bg-surface-2 shadow-[0_0_0_1px_var(--accent)]"
                  : o.slot === "C"
                    ? "border-wild/45 bg-surface hover:border-wild"
                    : "border-line bg-surface hover:border-muted",
              )}
            >
              {mine ? (
                <span className="absolute top-0 right-0 inline-flex items-center gap-1 rounded-bl-[14px] bg-accent px-3 py-1 text-xs font-bold text-ink">
                  <Sparkles aria-hidden="true" className="size-3.5" />
                  {PLAY_COPY.play.vote.yours}
                </span>
              ) : null}
              <span className="flex items-start gap-3">
                <OptionBadge slot={o.slot} />
                <span className={cn("min-w-0 flex-1", mine && "pr-14")}>
                  {tags.length > 0 ? <span className="mb-1 flex flex-wrap gap-1.5">{tags}</span> : null}
                  <span className="line-clamp-3 font-display text-[19px] leading-[1.2] font-bold break-words">{text}</span>
                </span>
              </span>
              <span className="flex items-center gap-3" aria-hidden="true">
                <span className="relative h-3 flex-1 overflow-hidden rounded-pill bg-bg">
                  <span
                    className={cn("absolute inset-y-0 left-0 rounded-pill transition-[width] duration-300 ease-out motion-reduce:transition-none", FILL[o.slot])}
                    style={{ width: `${Math.round(share * 100)}%` }}
                  />
                </span>
                <span className="w-12 text-right font-display text-lg leading-none font-extrabold tabular-nums">{pct}%</span>
              </span>
              {support ? (
                <span aria-hidden="true" className="-mt-1 text-xs text-muted">
                  {support}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
