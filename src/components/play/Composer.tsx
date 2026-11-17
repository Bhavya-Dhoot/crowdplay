"use client";
// The composer (UX §3.3): starter chips, a 140-character box and a gold Send button with the 2 s cooldown ring.
// It lives inside the dock's glass bar and owns its draft, so typing re-renders only this component (perf audit #8):
// the feed above never sees a keystroke. `lockedHint` non-null = disabled with that text as the placeholder.
//   ref.edit(text)   puts a refused idea back in the box (the feed's "Edit and resend") and focuses it
// A refused idea (audit #21): the input row shakes, the phone buzzes, the text comes back to the box (if it is still
// empty) and a 15 px message with an icon replaces the chip row for a few seconds.
import { ArrowUp, TriangleAlert } from "lucide-react";
import { memo, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type KeyboardEvent, type Ref } from "react";
import { cn } from "@/components/ui/cn";
import { Ring } from "@/components/ui/Countdown";
import { haptic } from "@/components/ui/motionTokens";
import { useCountdown } from "@/lib/client/useCountdown";
import { IDEA_COOLDOWN_MS, IDEA_MAX_CHARS, type SendResult } from "@/lib/client/useRoom";
import { COPY } from "@/lib/copy";
import { charsLeft, insertChip } from "./logic";
import styles from "./play.module.css";

export type ComposerHandle = { edit: (text: string) => void };

type Props = {
  roundNo: number;
  lockedHint: string | null;
  chips: string[];
  cooldownUntil: number;
  onSend: (text: string) => Promise<SendResult>;
  ref?: Ref<ComposerHandle>;
};

const MAX_BOX_PX = 96;
const fine = () => window.matchMedia("(pointer: fine)").matches;

export const Composer = memo(function Composer({ roundNo, lockedHint, chips, cooldownUntil, onSend, ref }: Props) {
  const locked = lockedHint !== null;
  const counterId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ round: roundNo, text: "" });
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The draft belongs to its round: a new round starts with an empty box.
  const draft = box.round === roundNo ? box.text : "";
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  });
  const setDraft = useCallback((text: string) => setBox({ round: roundNo, text }), [roundNo]);

  const cd = useCountdown({ endsAt: cooldownUntil || null, startedAt: cooldownUntil ? cooldownUntil - IDEA_COOLDOWN_MS : null });
  const cooling = !locked && cd.remainingMs !== null && cd.remainingMs > 0;
  const left = charsLeft(draft, IDEA_MAX_CHARS);
  const canSend = !locked && !cooling && !sending && draft.trim().length > 0;

  useImperativeHandle(
    ref,
    () => ({
      edit: (text: string) => {
        setDraft(text);
        inputRef.current?.focus({ preventScroll: true });
      },
    }),
    [setDraft],
  );

  useEffect(() => () => void (errorTimer.current && clearTimeout(errorTimer.current)), []);

  // Desktop only: pop the cursor into the box when typing opens. On phones a surprise keyboard would cover the feed.
  useEffect(() => {
    if (locked) return;
    if (fine()) inputRef.current?.focus({ preventScroll: true });
  }, [locked]);

  // The box grows with the text, up to three lines.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, MAX_BOX_PX)}px`;
  }, [draft]);

  function reject(message: string) {
    haptic("reject");
    setError(message);
    if (errorTimer.current) clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setError(null), 5000);
    const row = rowRef.current;
    if (row) {
      row.classList.remove(styles.shake);
      void row.offsetWidth; // restart the animation when it is refused twice in a row
      row.classList.add(styles.shake);
    }
  }

  async function send() {
    const text = draft;
    if (!canSend) return;
    haptic("tap");
    setError(null);
    setSending(true);
    setDraft("");
    // The send button is about to go quiet for the cooldown; keep a mouse or keyboard user typing in the box.
    if (fine()) inputRef.current?.focus({ preventScroll: true });
    const res = await onSend(text);
    setSending(false);
    if (!res.ok) {
      // Keep the words for editing, unless they already started the next idea.
      if (draftRef.current === "") setDraft(text);
      reject(res.message);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="flex min-h-[100px] flex-col gap-1">
      {error ? (
        <p role="alert" className="flex h-11 items-center gap-2 px-2 text-small leading-snug font-semibold text-danger">
          <TriangleAlert aria-hidden="true" className="size-5 shrink-0" />
          <span className="min-w-0">{error}</span>
        </p>
      ) : (
        <div className={cn("-mx-2 flex h-11 shrink-0 items-center gap-2 overflow-x-auto px-2", styles.noBar)} aria-label="Idea starters" role="group">
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              data-testid="starter-chip"
              disabled={locked}
              onClick={() => {
                setDraft(insertChip(draft, c, IDEA_MAX_CHARS));
                inputRef.current?.focus({ preventScroll: true });
              }}
              className={cn(
                "press inline-flex h-11 shrink-0 items-center rounded-pill border border-stage-line bg-stage-2 px-4 text-small font-medium whitespace-nowrap text-on-stage",
                "[--press-overlay:rgb(255_255_255/0.1)] disabled:opacity-40",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <div ref={rowRef} className="flex items-end gap-2">
        <div
          className={cn(
            "relative flex min-h-[52px] min-w-0 flex-1 items-center rounded-card border bg-stage-0/60 transition-colors duration-175",
            error ? "border-danger" : "border-stage-line focus-within:border-light",
            locked && "opacity-80",
          )}
        >
          <textarea
            ref={inputRef}
            data-testid="idea-input"
            rows={1}
            maxLength={IDEA_MAX_CHARS}
            value={draft}
            disabled={locked}
            onChange={(e) => {
              setDraft(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={onKeyDown}
            placeholder={locked ? lockedHint : COPY.composer.placeholder}
            aria-label="Your idea"
            aria-describedby={counterId}
            aria-invalid={error ? true : undefined}
            enterKeyHint="send"
            autoComplete="off"
            autoCapitalize="sentences"
            className="block min-w-0 flex-1 resize-none bg-transparent px-3.5 py-3.5 text-body leading-6 text-on-stage placeholder:text-muted-on-stage focus:outline-none disabled:cursor-not-allowed"
          />
          <p
            id={counterId}
            className={cn(
              "pointer-events-none",
              left <= 40 && !locked ? "absolute right-3 -top-2.5 rounded-pill bg-stage-1 px-1.5 text-fine leading-5 tabular-nums" : "sr-only",
              left <= 0 ? "text-danger" : left <= 20 ? "text-warn" : "text-muted-on-stage",
            )}
          >
            {left} characters left
          </p>
        </div>
        <div className="relative grid size-[52px] shrink-0 place-items-center">
          {cooling ? <Ring fraction={cd.fraction} size={52} stroke={3} className="absolute inset-0" /> : null}
          <button
            type="button"
            data-testid="idea-send"
            aria-label={COPY.composer.send}
            disabled={!canSend}
            onClick={() => void send()}
            className="press grid size-12 place-items-center rounded-full bg-gold text-ink disabled:bg-stage-2 disabled:text-muted-on-stage"
          >
            <ArrowUp aria-hidden="true" className="size-6" strokeWidth={2.75} />
          </button>
        </div>
      </div>
    </div>
  );
});
