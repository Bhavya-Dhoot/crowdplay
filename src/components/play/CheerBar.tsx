"use client";
// Cheers (P8): a row of emoji buttons that never blocks anything, plus the emoji other people send
// drifting up over the screen. Only mounted when features.cheers is on.
import { useEffect, useRef, useState } from "react";
import { m } from "@/components/ui/motion";
import { cn } from "@/components/ui/cn";
import { CHEER_EMOJI } from "@/lib/copy";
import type { CheerItem } from "@/lib/client/store";

const FLOAT_MS = 2200;
const MAX_FLOATING = 10;

type Floating = { id: string; emoji: string; x: number };

/** Stable 8..92 % horizontal spot from an id, so a cheer always rises from the same place. */
function spot(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return 8 + (h % 85);
}

export function CheerBar({ cheers, onCheer, disabled }: { cheers: CheerItem[]; onCheer: (emoji: string) => void; disabled: boolean }) {
  const [floating, setFloating] = useState<Floating[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const primed = useRef(false);
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    // Cheers that were already there when the page opened are history, not news.
    if (!primed.current) {
      primed.current = true;
      cheers.forEach((c) => seen.current.add(c.id));
      return;
    }
    const fresh = cheers.filter((c) => !seen.current.has(c.id));
    if (fresh.length === 0) return;
    fresh.forEach((c) => seen.current.add(c.id));
    const items = fresh.slice(-4).map((c) => ({ id: c.id, emoji: c.emoji, x: spot(c.id) }));
    for (const it of items) {
      const t = setTimeout(() => {
        timers.current.delete(t);
        setFloating((xs) => xs.filter((x) => x.id !== it.id));
      }, FLOAT_MS + 200);
      timers.current.add(t);
    }
    // The effect runs in response to an external event (a cheer arrived); one batched update is the point.
    setFloating((xs) => [...xs, ...items].slice(-MAX_FLOATING));
  }, [cheers]);

  return (
    <div className="relative">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-full h-44 overflow-hidden">
        {floating.map((f) => (
          <m.span
            key={f.id}
            initial={{ opacity: 0, y: 24, scale: 0.8 }}
            animate={{ opacity: [0, 1, 1, 0], y: -150, scale: 1.15 }}
            transition={{ duration: FLOAT_MS / 1000, ease: "easeOut", times: [0, 0.12, 0.7, 1] }}
            className="absolute bottom-0 text-3xl"
            style={{ left: `${f.x}%` }}
          >
            {f.emoji}
          </m.span>
        ))}
      </div>
      <div role="group" aria-label="Send a cheer" className="flex items-center justify-between">
        {CHEER_EMOJI.map((e) => (
          <button
            key={e}
            type="button"
            data-testid={`cheer-${e}`}
            aria-label={`Cheer ${e}`}
            disabled={disabled}
            onClick={() => onCheer(e)}
            className={cn(
              "grid size-11 place-items-center rounded-full text-[22px] leading-none transition-[transform,opacity,background-color] duration-150",
              "hover:bg-surface-2 active:scale-90 disabled:opacity-40 motion-reduce:transition-none motion-reduce:active:scale-100",
            )}
          >
            <span aria-hidden="true">{e}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
