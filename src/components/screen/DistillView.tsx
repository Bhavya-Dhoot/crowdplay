"use client";
// DISTILL: "The crowd has spoken… almost." on its numbered banner while three fat arrows pull the notes into three
// boxes (A, B and the dashed ⚡ wildcard). The notes are placed in their boxes one after another, never slid; under
// reduced motion they simply appear there.
import { useEffect, useMemo, useState } from "react";
import { NumberBanner } from "@/components/ui/Banner";
import { BotBadge } from "@/components/ui/BotBadge";
import { cn } from "@/components/ui/cn";
import { FatArrow } from "@/components/ui/FatArrow";
import { AnimatePresence, m } from "@/components/ui/motion";
import { TRANSITION } from "@/components/ui/motionTokens";
import type { FeedIdea } from "@/lib/client/store";
import { DISTILL_LINES } from "@/lib/copy";
import type { OptionSlot, PublicState } from "@/lib/realtime/types";
import { SCREEN_COPY } from "./copy";
import { bannerPx } from "./fit";
import { deal, DISTILL_CARDS, usableIdeas } from "./rain";
import { bannerStyle, OptionBadge, tiltStyle, useStage } from "./stage";

const PILES: OptionSlot[] = ["A", "B", "C"];
const TILT = { A: -0.8, B: 0.6, C: -0.4 } as const;

function RotatingLine({ compact }: { compact: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % DISTILL_LINES.length), 2200);
    return () => clearInterval(t);
  }, []);
  return (
    <div className={cn("relative grid shrink-0 place-items-center", compact ? "h-[1.7em]" : "h-[2em]")}>
      <AnimatePresence mode="wait" initial={false}>
        <m.p
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={TRANSITION.fast}
          className={cn("cps-slip leading-none", compact ? "px-[0.7em] py-[0.25em] text-[0.7em]" : "px-[0.9em] py-[0.3em] text-[1.2em]")}
        >
          {DISTILL_LINES[i]}
        </m.p>
      </AnimatePresence>
    </div>
  );
}

export function DistillView({ state, feed }: { state: PublicState; feed: FeedIdea[] }) {
  const { compact, metrics, px } = useStage();
  const notes = useMemo(() => {
    const take = compact ? 9 : DISTILL_CARDS;
    return usableIdeas(feed)
      .slice(-take)
      .map((idea, i) => ({ idea, i, ...deal(idea.key, i) }));
  }, [feed, compact]);
  const headline = SCREEN_COPY.distill.headline;

  return (
    <div className="absolute inset-0 flex flex-col items-center" style={{ paddingInline: px(metrics.padX), paddingTop: px(compact ? 2 : 6), paddingBottom: px(compact ? 8 : 26), gap: px(compact ? 4 : 10) }}>
      <h2 className="m-0 shrink-0 leading-none">
        <NumberBanner n={state.roundNo} label={headline} size="xl" play style={bannerStyle(px(bannerPx(headline, compact ? 640 : 1500, compact ? 22 : 48)))} />
      </h2>
      <RotatingLine compact={compact} />

      <div className="grid min-h-0 w-full flex-1 grid-cols-3 grid-rows-[auto_minmax(0,1fr)]" style={{ columnGap: px(compact ? 14 : 44), rowGap: px(compact ? 4 : 12) }} aria-hidden="true">
        {PILES.map((slot, i) => (
          <div key={`arrow-${slot}`} className="flex justify-center">
            <FatArrow direction="down" size={px(compact ? 24 : 64)} delayMs={300 + i * 160} seed={`distill-${slot}`} />
          </div>
        ))}
        {PILES.map((slot, i) => (
          <div
            key={slot}
            style={tiltStyle(TILT[slot])}
            className={cn("cps-box cps-box-poster flex min-h-0 flex-col", i % 2 === 1 && "cps-box-alt", slot === "C" && "cps-box-dashed")}
          >
            <div className="absolute z-10" style={{ left: px(compact ? 8 : 20), top: px(compact ? -14 : -38) }}>
              <OptionBadge slot={slot} size={compact ? 28 : 74} />
            </div>
            <div className={cn("flex min-h-0 flex-1 flex-wrap content-start justify-center overflow-hidden", compact ? "gap-[0.3em] p-[0.6em] pt-[0.9em]" : "gap-[0.45em] p-[0.7em] pt-[1.5em]")}>
              {notes
                .filter((n) => n.pile === i)
                .map((n) => (
                  <div
                    key={n.idea.key}
                    style={{ ...tiltStyle(n.tilt), ["--placed-delay" as string]: `${250 + n.i * 60}ms`, width: compact ? "100%" : "47%" }}
                    className="cps-note placed px-[0.5em] py-[0.3em]"
                  >
                    <p className={cn("line-clamp-2 leading-[1.18] text-ink", compact ? "text-[0.6em]" : "text-[0.95em]")}>{n.idea.text}</p>
                    <p className="mt-[0.15em] flex items-center gap-[0.4em] leading-[1.2] text-ink-notes" style={{ fontSize: `max(${compact ? 0.42 : 0.6}em, ${px(compact ? 10 : 18)}px)` }}>
                      <span className="truncate">{n.idea.name}</span>
                      {n.idea.isBot ? <BotBadge className="px-[0.35em]! text-[1.05em]! leading-[1.25]!" /> : null}
                    </p>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
