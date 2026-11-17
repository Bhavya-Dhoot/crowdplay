"use client";
// CodeInput: the show code as 5 paper tiles (ink letters in Bricolage on warm paper, so they read on the stage). Letters only (typed or pasted), upper-cased,
// auto-advances, Backspace steps back, arrows move, and pasting "abc de" anywhere fills the tiles.
//   const [code, setCode] = useState("");
//   <CodeInput value={code} onChange={setCode} onComplete={(c) => router.push(`/join/${c}`)} />
// `value` is always a contiguous run of A-Z (no gaps). Props: length (5), label, autoFocus,
// disabled, invalid. Each tile is at least 44 px wide on a 360 px phone. Invalid = a thicker danger border (the page
// shows the message in words). The focus ring is the global gold one, drawn outside the tile.
import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { cn } from "./cn";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  length?: number;
  label?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
};

const letters = (s: string): string => s.replace(/[^a-zA-Z]/g, "").toUpperCase();

export function CodeInput({ value, onChange, onComplete, length = 5, label = "Show code", autoFocus, disabled, invalid, className }: Props) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const focusTile = (i: number) => {
    const el = refs.current[Math.max(0, Math.min(i, length - 1))];
    el?.focus();
    el?.select();
  };

  const commit = (next: string, focusAt: number) => {
    const v = next.slice(0, length);
    onChange(v);
    if (v.length === length) onComplete?.(v);
    focusTile(focusAt);
  };

  // `at` letters in, starting at tile i. Several letters (paste, autofill) fill forward.
  const insert = (i: number, typed: string) => {
    if (!typed) return;
    const at = Math.min(i, value.length);
    if (typed.length >= length) return commit(typed, length - 1);
    if (typed.length > 1) return commit(value.slice(0, at) + typed, at + typed.length);
    commit(value.slice(0, at) + typed + value.slice(at + 1), at + 1);
  };

  const onInput = (i: number, raw: string) => {
    let typed = letters(raw);
    // Typing into a filled tile yields "AB": keep only the new letter.
    if (typed.length === 2 && value[i] && typed.includes(value[i])) typed = typed.replace(value[i], "");
    if (!typed) {
      // Nothing usable (a digit, a symbol, or the tile was cleared): drop this tile's letter.
      if (raw === "" && value[i]) commit(value.slice(0, i) + value.slice(i + 1), i);
      return;
    }
    insert(i, typed);
  };

  const onKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (value[i]) commit(value.slice(0, i) + value.slice(i + 1), i);
      else if (i > 0) commit(value.slice(0, i - 1) + value.slice(i), i - 1);
    } else if (e.key === "Delete") {
      e.preventDefault();
      if (value[i]) commit(value.slice(0, i) + value.slice(i + 1), i);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusTile(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusTile(i + 1);
    }
  };

  const onPaste = (i: number, e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    insert(i, letters(e.clipboardData.getData("text")));
  };

  return (
    <div role="group" aria-label={label} className={cn("flex w-full justify-center gap-2", className)}>
      {Array.from({ length }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={value[i] ?? ""}
          onChange={(e) => onInput(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={(e) => onPaste(i, e)}
          onFocus={(e) => e.target.select()}
          onPointerDown={(e) => {
            // Tapping past the end never leaves a gap: land on the first empty tile instead.
            if (i > value.length) {
              e.preventDefault();
              focusTile(value.length);
            }
          }}
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="go"
          autoFocus={autoFocus && i === 0}
          disabled={disabled}
          aria-label={`${label}, letter ${i + 1} of ${length}`}
          aria-invalid={invalid || undefined}
          className={cn(
            "aspect-[4/5] w-0 min-w-11 max-w-14 flex-1 rounded-element border-2 bg-paper text-center font-display text-[clamp(1.5rem,7vw,2rem)] leading-none font-extrabold text-ink uppercase caret-ink",
            "shadow-[inset_0_1px_0_rgb(255_255_255/0.55),0_1px_0_var(--paper-edge)] transition-colors duration-175 motion-reduce:transition-none",
            invalid ? "border-danger-on-paper" : value[i] ? "border-ink" : "border-paper-edge",
          )}
        />
      ))}
    </div>
  );
}
