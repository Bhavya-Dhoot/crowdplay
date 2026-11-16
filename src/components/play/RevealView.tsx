"use client";
// REVEAL body: the winner card expands inside a lit marquee, the narration types in (all at once under
// reduced motion), credits name the people behind it, and the losing options fade to their final %.
import { Sparkles, Zap } from "lucide-react";
import { useEffect } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/components/ui/cn";
import { m } from "@/components/ui/motion";
import { Pill } from "@/components/ui/Pill";
import { Skeleton } from "@/components/ui/Skeleton";
import { COPY, creditLine } from "@/lib/copy";
import type { PublicOption, PublicState } from "@/lib/realtime/types";
import { useTypewriter } from "./hooks";
import { votePercent } from "./logic";
import { PLAY_COPY } from "./playCopy";
import styles from "./play.module.css";
import { OptionBadge } from "./VoteView";

type Props = {
  state: PublicState;
  narration: string | null;
  label: (o: PublicOption) => string;
  mineIds: string[];
  reduced: boolean;
};

async function burst(reduced: boolean): Promise<void> {
  if (reduced) return;
  const { default: confetti } = await import("canvas-confetti");
  const colors = ["#FFD23F", "#5B8CFF", "#3DDC97", "#FF4D8D"];
  void confetti({ particleCount: 70, spread: 75, startVelocity: 38, origin: { x: 0.5, y: 0.42 }, colors, disableForReducedMotion: true, ticks: 160 });
}

export function RevealView({ state, narration, label, mineIds, reduced }: Props) {
  const options = state.options ?? [];
  const outcome = state.outcome;
  const winner = options.find((o) => o.id === outcome?.optionId);
  const losers = options.filter((o) => o.id !== winner?.id).sort((a, b) => a.slot.localeCompare(b.slot));
  const text = narration ?? "";
  const typed = useTypewriter(text, reduced);
  const pct = winner ? votePercent(state.tally, state.votesTotal, winner.id) : 0;
  const mine = winner ? mineIds.includes(winner.id) : false;
  const credit = outcome?.credit ?? [];
  const winnerId = winner?.id;

  useEffect(() => {
    if (winnerId) void burst(reduced);
  }, [winnerId, state.roundNo, reduced]);

  return (
    <div className="h-full overflow-y-auto overscroll-contain pb-2">
      {winner ? (
        <m.div
          key={winner.id}
          initial={{ opacity: 0, scale: 0.9, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 22 }}
          className="marquee"
        >
          <div data-testid="winner" className="relative overflow-hidden rounded-card border border-accent/70 bg-surface p-4">
            {mine ? (
              <span className="absolute top-0 right-0 inline-flex items-center gap-1 rounded-bl-[14px] bg-accent px-3 py-1 text-xs font-bold text-ink">
                <Sparkles aria-hidden="true" className="size-3.5" />
                {PLAY_COPY.play.vote.yours}
              </span>
            ) : null}
            <p className="text-sm text-muted">{PLAY_COPY.play.reveal.picked}</p>
            <div className="mt-2 flex items-start gap-3">
              <OptionBadge slot={winner.slot} size={44} />
              <div className={cn("min-w-0 flex-1", mine && "pr-14")}>
                {winner.kind === "wildcard" ? (
                  <Pill tone="wild" size="sm" className="mb-1">
                    <Zap aria-hidden="true" className="size-3" strokeWidth={3} />
                    {PLAY_COPY.play.vote.wildcard}
                  </Pill>
                ) : winner.kind === "narrator" ? (
                  <Pill size="sm" className="mb-1">
                    {COPY.reveal.narratorPick}
                  </Pill>
                ) : null}
                <h2 className="font-display text-2xl leading-[1.15] break-words">{label(winner)}</h2>
                <p className="mt-1 text-sm font-semibold text-accent tabular-nums">{pct}% of the vote</p>
              </div>
            </div>

            {credit.length > 0 || (outcome?.more ?? 0) > 0 ? (
              <div data-testid="credits" className="mt-3 flex items-center gap-2.5 rounded-[12px] bg-bg px-3 py-2.5">
                <span aria-hidden="true" className="flex shrink-0 -space-x-2">
                  {credit.slice(0, 3).map((c) => (
                    <Avatar key={c.name} name={c.name} size={26} className="ring-2 ring-bg" />
                  ))}
                </span>
                <p className="min-w-0 text-sm leading-snug font-medium break-words">
                  <span className="text-muted">{PLAY_COPY.play.reveal.credits} </span>
                  <span className="text-accent">{creditLine(credit, outcome?.more ?? 0)}</span>
                </p>
              </div>
            ) : null}

            <div className="mt-3 min-h-[96px]">
              {text ? (
                <p data-testid="narration" className="relative text-[17px] leading-relaxed">
                  {/* The full text reserves the final layout (and is what screen readers get); the typed
                      text is an out-of-flow overlay, so typing never shifts anything (CLS). */}
                  <span className="text-transparent select-none">{text}</span>
                  <span aria-hidden="true" className="absolute inset-0">
                    {text.slice(0, typed.shown)}
                    {typed.done ? null : <span className={styles.caret} />}
                  </span>
                </p>
              ) : (
                <div data-testid="narration-pending" role="status" className="space-y-2.5">
                  <span className="sr-only">{PLAY_COPY.play.reveal.narrator}</span>
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-[92%]" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              )}
            </div>
          </div>
        </m.div>
      ) : (
        <div className="rounded-card border border-line bg-surface p-4" role="status">
          <p className="font-display text-xl font-bold">The crowd has decided…</p>
        </div>
      )}

      {losers.length > 0 ? (
        <section aria-label={PLAY_COPY.play.reveal.lost} className="mt-3 space-y-2">
          {losers.map((o, i) => (
            <m.div
              key={o.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.55 }}
              transition={{ duration: 0.5, delay: 0.5 + i * 0.12 }}
              className="flex items-center gap-3 rounded-card border border-line bg-surface px-3 py-2.5"
            >
              <OptionBadge slot={o.slot} size={28} />
              <p className="line-clamp-2 min-w-0 flex-1 text-sm leading-snug">{label(o)}</p>
              <span className="font-display text-base font-extrabold tabular-nums">{votePercent(state.tally, state.votesTotal, o.id)}%</span>
            </m.div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
