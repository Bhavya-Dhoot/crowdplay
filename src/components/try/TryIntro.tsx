"use client";
// /try before the show: a name box with a dice re-roll and one big "Start the demo".
import { Dices } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { getStoredName } from "@/lib/client/session";
import { randomName } from "@/lib/copy";
import { TRY_COPY } from "./tryCopy";

export function TryIntro({ onStart }: { onStart: (name: string) => Promise<string | null> }) {
  const nameId = useId();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stored name and the random default are browser-only: read after mount so the server HTML stays stable.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(getStoredName() ?? randomName());
  }, []);

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
    <section aria-labelledby="try-title" className="mx-auto w-full max-w-md px-4 pt-6 pb-10 md:pt-14">
      <p className="inline-flex items-center rounded-pill border border-wild/60 px-3 py-1.5 text-sm font-semibold text-wild">{TRY_COPY.pill}</p>
      <h1 id="try-title" className="mt-4 font-display text-[40px] leading-[1.02] font-extrabold tracking-tight text-balance md:text-5xl">
        {TRY_COPY.title}
      </h1>
      <p className="mt-3 text-lg text-muted">{TRY_COPY.lead}</p>

      <form onSubmit={submit} noValidate className="mt-7 rounded-card border border-line bg-surface p-5">
        <label htmlFor={nameId} className="block text-sm font-medium">
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
              "h-14 min-w-0 flex-1 rounded-card border bg-surface-2 px-4 text-lg font-medium text-text placeholder:text-muted focus:outline-none",
              error ? "border-danger" : "border-line focus:border-accent",
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
            className="inline-flex size-14 shrink-0 items-center justify-center rounded-card border border-line bg-surface-2 text-text transition-colors hover:border-muted motion-reduce:transition-none"
          >
            <Dices aria-hidden="true" className="size-6" />
          </button>
        </div>
        <p id={`${nameId}-error`} role="alert" className="mt-2 text-sm text-danger empty:hidden">
          {error}
        </p>
        <Button type="submit" size="lg" block loading={busy} data-testid="try-start" className="mt-4">
          {busy ? TRY_COPY.starting : TRY_COPY.start}
        </Button>
      </form>

      <ol className="mt-6 grid gap-3 sm:grid-cols-3" aria-label="How the demo goes">
        {TRY_COPY.steps.map((s, i) => (
          <li key={s.title} className="rounded-card border border-line bg-surface/60 p-3">
            <p className="font-display text-sm font-bold text-accent">{i + 1}</p>
            <p className="mt-1 text-[15px] leading-tight font-semibold">{s.title}</p>
            <p className="mt-1 text-[13px] leading-snug text-muted">{s.body}</p>
          </li>
        ))}
      </ol>
      <p className="mt-5 text-sm text-muted">{TRY_COPY.honest}</p>
    </section>
  );
}
