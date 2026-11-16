"use client";
// DISTILL: the ideas swirl into three piles (A, B, wildcard) while "The crowd has spoken… almost."
// holds the room. Cards only use transforms; under reduced motion they simply appear in their piles.
import { useEffect, useMemo, useState } from "react";
import { BotBadge } from "@/components/ui/BotBadge";
import { cn } from "@/components/ui/cn";
import { AnimatePresence, m } from "@/components/ui/motion";
import type { FeedIdea } from "@/lib/client/store";
import { DISTILL_LINES } from "@/lib/copy";
import type { OptionSlot } from "@/lib/realtime/types";
import { SCREEN_COPY } from "./copy";
import { DISTILL_CARDS, PILE_Y, swirlPath, usableIdeas } from "./rain";
import { OptionBadge, useStage } from "./stage";

const PILES: OptionSlot[] = ["A", "B", "C"];

function RotatingLine({ compact }: { compact: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % DISTILL_LINES.length), 2200);
    return () => clearInterval(t);
  }, []);
  return (
    <div className={cn("relative grid place-items-center", compact ? "h-[1.4em]" : "h-[1.8em]")}>
      <AnimatePresence mode="wait" initial={false}>
        <m.p
          key={i}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.22 }}
          className={cn("font-semibold text-muted", compact ? "text-[0.7em]" : "text-[1.3em]")}
        >
          {DISTILL_LINES[i]}
        </m.p>
      </AnimatePresence>
    </div>
  );
}

export function DistillView({ feed }: { feed: FeedIdea[] }) {
  const { compact, metrics, px } = useStage();
  const areaW = metrics.w - metrics.padX * 2;
  const areaH = metrics.h - metrics.header - metrics.footer - (compact ? 110 : 330);
  const cards = useMemo(() => {
    const take = compact ? 12 : DISTILL_CARDS;
    return usableIdeas(feed)
      .slice(-take)
      .map((idea, i) => ({ idea, path: swirlPath(idea.key, i, areaW, areaH) }));
  }, [feed, compact, areaW, areaH]);

  return (
    <div className="absolute inset-0 flex flex-col items-center" style={{ paddingInline: px(metrics.padX), paddingTop: px(compact ? 4 : 10), paddingBottom: px(compact ? 8 : 20) }}>
      <m.h2
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className={cn("text-center font-display leading-none font-extrabold tracking-tight", compact ? "text-[1.5em]" : "text-[3.8em]")}
      >
        {SCREEN_COPY.distill.headline}
      </m.h2>

      <div className="relative min-h-0 w-full flex-1" aria-hidden="true">
        {PILES.map((slot, i) => (
          <div
            key={slot}
            className="absolute top-1/2 left-1/2 flex flex-col items-center gap-[0.5em]"
            style={{ transform: `translate(calc(-50% + ${px((i - 1) * areaW * 0.3)}px), calc(-50% + ${px(areaH * PILE_Y + (compact ? 10 : 30))}px))` }}
          >
            <span className={cn("block rounded-[0.6em] border-2 border-dashed border-line bg-surface/40", compact ? "h-[3.2em] w-[7em]" : "h-[9em] w-[13em]")} />
            <OptionBadge slot={slot} size={compact ? 26 : 66} className="motion-safe:animate-pulse" />
          </div>
        ))}

        {cards.map(({ idea, path }, i) => (
          <m.div
            key={idea.key}
            initial={{ opacity: 0, x: px(path.from.x), y: px(path.from.y), rotate: path.from.r, scale: 1 }}
            animate={{
              opacity: 1,
              x: [px(path.from.x), px(path.mid.x), px(path.to.x)],
              y: [px(path.from.y), px(path.mid.y), px(path.to.y)],
              rotate: [path.from.r, path.mid.r, path.to.r],
              scale: [1, 0.85, compact ? 0.5 : 0.82],
            }}
            transition={{
              opacity: { duration: 0.2 },
              default: { duration: 2.1, delay: 0.15 + i * 0.045, times: [0, 0.55, 1], ease: "easeInOut" },
            }}
            className={cn(
              "absolute top-1/2 left-1/2 rounded-[0.5em] border border-line bg-surface-2 shadow-[0_8px_20px_-10px_rgb(0_0_0/0.9)]",
              compact ? "-mt-[1em] -ml-[3em] w-[6em] px-[0.5em] py-[0.35em]" : "-mt-[1.6em] -ml-[5.5em] w-[11em] px-[0.7em] py-[0.5em]",
            )}
          >
            <p className={cn("line-clamp-2 leading-[1.18] font-semibold text-text", compact ? "text-[0.6em]" : "text-[0.85em]")}>{idea.text}</p>
            <p className={cn("mt-[0.2em] flex items-center gap-[0.4em] leading-none text-muted", compact ? "text-[0.45em]" : "text-[0.58em]")}>
              <span className="truncate">{idea.name}</span>
              {idea.isBot ? <BotBadge className="px-[0.35em]! text-[1.2em]! leading-[1.3]!" /> : null}
            </p>
          </m.div>
        ))}
      </div>

      <RotatingLine compact={compact} />
    </div>
  );
}
