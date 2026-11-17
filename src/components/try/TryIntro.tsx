"use client";
// /try without a ready name: reached by a plain /try link (the landing button starts the demo directly), or after
// that direct start failed. One paper "admit one" card: the name (pre-filled, with a dice re-roll) and one gold
// "Start the demo". Nothing else stands between the judge and the show.
import { Dices } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { PaperCard } from "@/components/ui/PaperCard";
import { getStoredName } from "@/lib/client/session";
import { randomName } from "@/lib/copy";
import { TRY_COPY } from "./tryCopy";

export function TryIntro({
  onStart,
  initialName,
  initialError,
}: {
  onStart: (name: string) => Promise<string | null>;
  initialName?: string;
  initialError?: string | null;
}) {
  const nameId = useId();
  const [name, setName] = useState(initialName ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);

  // Stored name and the random default are browser-only: read after mount so the server HTML stays stable.
  useEffect(() => {
    if (initialName) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(getStoredName() ?? randomName());
  }, [initialName]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError(TRY_COPY.nameShort);
      return;
    }
    setBusy(true);
    setError(null);
    const failure = await onStart(trimmed);
    if (failure) {
      setBusy(false);
      setError(failure);
    }
  }

  return (
    <section aria-labelledby="try-title" className="mx-auto w-full max-w-md px-4 pt-8 pb-10 md:pt-16">
      <h1 id="try-title" className="font-display text-h1 leading-[1.05] font-extrabold tracking-tight text-balance text-on-stage md:text-[44px]">
        {TRY_COPY.title}
      </h1>
      <p className="script mt-3 text-lead text-on-stage">{TRY_COPY.lead}</p>

      <PaperCard as="div" tilt={-0.8} className="mt-7 rounded-card p-5">
        <form onSubmit={submit} noValidate>
          <label htmlFor={nameId} className="block text-small font-semibold text-ink">
            {TRY_COPY.nameLabel}
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id={nameId}
              data-testid="name-input"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              minLength={2}
              maxLength={20}
              autoComplete="nickname"
              autoCapitalize="words"
              spellCheck={false}
              aria-describedby={error ? `${nameId}-error` : undefined}
              aria-invalid={error ? true : undefined}
              className={cn(
                "h-14 min-w-0 flex-1 rounded-element border bg-paper-2 px-4 text-lead font-medium text-ink placeholder:text-ink-muted focus:outline-none",
                error ? "border-danger-on-paper" : "border-paper-edge focus:border-ink",
              )}
            />
            <button
              type="button"
              onClick={() => {
                setName(randomName());
                setError(null);
              }}
              aria-label={TRY_COPY.reroll}
              title={TRY_COPY.reroll}
              className="press inline-flex size-14 shrink-0 items-center justify-center rounded-element border border-paper-edge bg-paper-2 text-ink"
            >
              <Dices aria-hidden="true" className="size-6" />
            </button>
          </div>
          <p id={`${nameId}-error`} role="alert" className="mt-2 text-small text-danger-on-paper empty:hidden">
            {error}
          </p>
          <Button type="submit" size="lg" block loading={busy} data-testid="try-start" className="mt-4">
            {busy ? TRY_COPY.starting : TRY_COPY.start}
          </Button>
        </form>
      </PaperCard>

      <p className="mt-5 text-small text-muted-on-stage">{TRY_COPY.honest}</p>
    </section>
  );
}
