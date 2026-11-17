"use client";
// ScriptText: the "script" voice (Fraunces) with an optional typewriter reveal that never shifts layout.
//   <ScriptText text={narration} className="text-lead" cps={34} delayMs={0} play onDone={() => ...} as="p" />
// The WHOLE text is always in the flow: the typed part is visible, the rest is transparent in the same flow, so line
// breaks and height are final from the first frame. Screen readers get the full sentence immediately (the page's own
// aria-live region does the announcing). Under prefers-reduced-motion (CSS, so it holds before hydration too) the
// full text shows at once and onDone fires on mount.
//   cps       characters per second (default 34); the clock is wall time, so a throttled tab catches up
//   play      false holds at the start (e.g. wait for the CANON stamp); flip it to true to begin
//   delayMs   wait after play turns true
//   caret     blinking caret while typing (default true), removed when done
//   onDone    called once per `text`, when the last character is shown
// Changing `text` restarts the reveal. Font size and colour come from className (text-ink on paper, etc.).
import { useEffect, useMemo, useRef, useState, type ElementType } from "react";
import { cn } from "./cn";
import { useReducedMotion } from "@/lib/client/useReducedMotion";

type Props = {
  text: string;
  cps?: number;
  delayMs?: number;
  play?: boolean;
  caret?: boolean;
  onDone?: () => void;
  as?: ElementType;
  className?: string;
};

export function ScriptText({ text, ...rest }: Props) {
  // Keyed by text so a new narration restarts cleanly without effect-driven resets.
  return <Typed key={text} text={text} {...rest} />;
}

function Typed({ text, cps = 34, delayMs = 0, play = true, caret = true, onDone, as: Tag = "p", className }: Props) {
  const reduced = useReducedMotion();
  const chars = useMemo(() => Array.from(text), [text]); // code points, so emoji are never cut in half
  const total = chars.length;
  const [shown, setShown] = useState(0);
  const done = useRef(false);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    if (!play && !reduced) return;
    if (reduced || total === 0) {
      if (!done.current) {
        done.current = true;
        onDoneRef.current?.();
      }
      return;
    }
    let raf = 0;
    let start = 0;
    const t = window.setTimeout(() => {
      start = performance.now();
      const tick = (now: number) => {
        const n = Math.min(total, Math.floor(((now - start) / 1000) * cps) + 1);
        setShown((prev) => (prev === n ? prev : n));
        if (n >= total) {
          if (!done.current) {
            done.current = true;
            onDoneRef.current?.();
          }
          return;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delayMs);
    return () => {
      window.clearTimeout(t);
      cancelAnimationFrame(raf);
    };
  }, [play, reduced, total, cps, delayMs]);

  const n = reduced ? total : shown;
  const typed = chars.slice(0, n).join("");
  // The full text sits in flow, transparent, and fixes the layout (and is what screen readers read). The typed text
  // is an out-of-flow overlay: inserting characters into a flow span shifts its transparent remainder on every frame,
  // which Lighthouse counted as CLS 0.17 on /play.
  return (
    <Tag className={cn("script relative", className)}>
      <span className="script-rest">{text}</span>
      <span aria-hidden="true" className="script-typed absolute inset-0">
        {typed}
        {caret && n < total && play ? <span className="script-caret" /> : null}
      </span>
    </Tag>
  );
}
