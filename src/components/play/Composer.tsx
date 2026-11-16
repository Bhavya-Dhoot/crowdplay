"use client";
// The composer (UX §3.3): starter chips, a 140-character input, a send button with the 2 s cooldown
// ring. `lockedHint` non-null = disabled with that text as the placeholder ("Get ready…", "Reconnecting…").
// The slot has one fixed height so STORM <-> PROMPT <-> DISTILL never shift the feed above it.
import { ArrowUp } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { cn } from "@/components/ui/cn";
import { Ring } from "@/components/ui/Countdown";
import { useCountdown } from "@/lib/client/useCountdown";
import { IDEA_COOLDOWN_MS, IDEA_MAX_CHARS, type SendResult } from "@/lib/client/useRoom";
import { COPY } from "@/lib/copy";
import { charsLeft, insertChip } from "./logic";
import styles from "./play.module.css";

type Props = {
  draft: string;
  onDraft: (v: string) => void;
  lockedHint: string | null;
  chips: string[];
  cooldownUntil: number;
  /** inFeed: a failed idea already sits in the feed as a rejected bubble that carries the message and an Edit button. */
  onSend: (text: string) => Promise<SendResult & { inFeed?: boolean }>;
  inputRef: RefObject<HTMLTextAreaElement | null>;
};

export function Composer({ draft, onDraft, lockedHint, chips, cooldownUntil, onSend, inputRef }: Props) {
  const locked = lockedHint !== null;
  const counterId = useId();
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cd = useCountdown({ endsAt: cooldownUntil || null, startedAt: cooldownUntil ? cooldownUntil - IDEA_COOLDOWN_MS : null });
  const cooling = !locked && cd.remainingMs !== null && cd.remainingMs > 0;
  const left = charsLeft(draft, IDEA_MAX_CHARS);
  const canSend = !locked && !cooling && !sending && draft.trim().length > 0;

  useEffect(() => () => void (errorTimer.current && clearTimeout(errorTimer.current)), []);

  // Desktop only: pop the cursor into the box when typing opens. On phones a surprise keyboard would cover the feed.
  useEffect(() => {
    if (locked) return;
    if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus({ preventScroll: true });
  }, [locked, inputRef]);

  function flash(message: string) {
    setError(message);
    if (errorTimer.current) clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setError(null), 4500);
  }

  async function send() {
    const text = draft;
    if (!canSend) return;
    setError(null);
    setSending(true);
    onDraft("");
    // The send button is about to go quiet for the cooldown; keep a mouse or keyboard user typing in the box.
    if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus({ preventScroll: true });
    const res = await onSend(text);
    setSending(false);
    if (!res.ok && !res.inFeed) {
      onDraft(text);
      flash(res.message);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="flex h-[132px] flex-col gap-2">
      <div className={cn("-mx-4 flex h-11 shrink-0 items-center gap-2 overflow-x-auto px-4", styles.noBar)} aria-label="Idea starters" role="group">
        {chips.map((c) => (
          <button
            key={c}
            type="button"
            data-testid="starter-chip"
            disabled={locked}
            onClick={() => {
              onDraft(insertChip(draft, c, IDEA_MAX_CHARS));
              inputRef.current?.focus({ preventScroll: true });
            }}
            className={cn(
              "inline-flex h-11 shrink-0 items-center rounded-pill border border-line bg-surface px-4 text-sm font-medium whitespace-nowrap text-text",
              "transition-[transform,border-color,opacity] duration-150 hover:border-accent active:scale-[0.97] disabled:opacity-40 disabled:hover:border-line motion-reduce:transition-none motion-reduce:active:scale-100",
            )}
          >
            {c}
          </button>
        ))}
      </div>

      <div
        className={cn(
          "relative flex min-h-0 flex-1 items-stretch rounded-card border bg-surface-2 transition-colors motion-reduce:transition-none",
          locked ? "border-line opacity-80" : "border-line focus-within:border-accent",
        )}
      >
        <textarea
          ref={inputRef}
          data-testid="idea-input"
          rows={2}
          maxLength={IDEA_MAX_CHARS}
          value={draft}
          disabled={locked}
          onChange={(e) => {
            onDraft(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={onKeyDown}
          placeholder={locked ? lockedHint : COPY.composer.placeholder}
          aria-label="Your idea"
          aria-describedby={counterId}
          enterKeyHint="send"
          autoComplete="off"
          autoCapitalize="sentences"
          className="min-w-0 flex-1 resize-none bg-transparent py-2.5 pr-2 pl-4 text-base leading-[22px] text-text placeholder:text-muted focus:outline-none disabled:cursor-not-allowed"
        />
        <div className="flex w-[68px] shrink-0 items-center justify-center">
          <div className="relative grid size-14 place-items-center">
            {cooling ? <Ring fraction={cd.fraction} size={56} stroke={4} className="absolute inset-0" /> : null}
            <button
              type="button"
              data-testid="idea-send"
              aria-label={COPY.composer.send}
              disabled={!canSend}
              onClick={() => void send()}
              className={cn(
                "grid size-11 place-items-center rounded-full bg-accent text-ink transition-[transform,opacity,filter] duration-150",
                "hover:brightness-110 active:scale-90 disabled:bg-surface disabled:text-muted disabled:opacity-100 motion-reduce:transition-none motion-reduce:active:scale-100",
              )}
            >
              <ArrowUp aria-hidden="true" className="size-6" strokeWidth={2.5} />
            </button>
          </div>
        </div>
        <p
          id={counterId}
          className={cn(
            "pointer-events-none absolute bottom-1.5 left-4 max-w-[calc(100%-96px)] truncate text-xs tabular-nums",
            error ? "font-medium text-danger" : left <= 0 ? "text-danger" : left <= 20 ? "text-warn" : "text-muted",
          )}
          role={error ? "alert" : undefined}
        >
          {error ?? (locked ? "" : `${draft.length}/${IDEA_MAX_CHARS}`)}
        </p>
      </div>
    </div>
  );
}
