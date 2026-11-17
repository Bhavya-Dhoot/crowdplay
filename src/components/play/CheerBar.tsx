"use client";
// Cheers (P8), in two parts so they can never cover the composer (audit #15):
//   <CheerFloat cheers/>   the emoji other people send, rising once from a stable spot. It fills the feed area (clipped by
//                          it, aria-hidden, pointer-events none, always below the dock), so nothing can pass over the
//                          textbox or Send.
//   <CheerBar onCheer disabled/>   the row of emoji buttons inside the dock. Only mounted when features.cheers is on.
import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui/cn";
import { haptic } from "@/components/ui/motionTokens";
import { CHEER_EMOJI } from "@/lib/copy";
import type { CheerItem } from "@/lib/client/store";
import styles from "./play.module.css";

const FLOAT_MS = 2200;
const MAX_FLOATING = 10;

type Floating = { id: string; emoji: string; x: number };

/** Stable 8..92 % horizontal spot from an id, so a cheer always rises from the same place. */
function spot(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return 8 + (h % 85);
}

export function CheerFloat({ cheers }: { cheers: CheerItem[] }) {
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
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
      {floating.map((f) => (
        <span key={f.id} className={styles.cheer} style={{ left: `${f.x}%` }}>
          {f.emoji}
        </span>
      ))}
    </div>
  );
}

export function CheerBar({ onCheer, disabled }: { onCheer: (emoji: string) => void; disabled: boolean }) {
  return (
    <div role="group" aria-label="Send a cheer" className="flex items-center justify-between px-1">
      {CHEER_EMOJI.map((e) => (
        <button
          key={e}
          type="button"
          data-testid={`cheer-${e}`}
          aria-label={`Cheer ${e}`}
          disabled={disabled}
          onClick={() => {
            haptic("tap");
            onCheer(e);
          }}
          className={cn("press grid size-11 place-items-center rounded-blob text-[22px] leading-none", "disabled:opacity-40")}
        >
          <span aria-hidden="true">{e}</span>
        </button>
      ))}
    </div>
  );
}
