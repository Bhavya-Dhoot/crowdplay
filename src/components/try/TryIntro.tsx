"use client";
// /try without a ready name: reached by a plain /try link (the landing button starts the demo directly), or after
// that direct start failed. A short page of notes: the headline, one taped note with the name (pre-filled, with a dice
// re-roll) and the page's one yellow key, "Start the demo". Nothing else stands between the judge and the show.
import { CircleAlert, Dices } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { PaperCard } from "@/components/ui/PaperCard";
import { Swash } from "@/components/ui/Swash";
import { getStoredName } from "@/lib/client/session";
import { randomName } from "@/lib/copy";
import { Tape } from "./Tape";
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

  // "Play a whole show. <swash>Alone.</swash>": the one word the page is about gets the marker.
  const at = TRY_COPY.title.lastIndexOf("Alone");
  const lead = at > 0 ? TRY_COPY.title.slice(0, at) : "";
  const marked = at > 0 ? TRY_COPY.title.slice(at) : TRY_COPY.title;

  return (
    <section aria-labelledby="try-title" className="mx-auto w-full max-w-xl px-4 pt-6 pb-12 md:pt-14">
      <h1 id="try-title" className="text-[clamp(2.1rem,9vw,3.25rem)] leading-[1.12]">
        {lead}
        <Swash play delayMs={300}>
          {marked}
        </Swash>
      </h1>
      <p className="mt-4 max-w-[40ch] text-lead text-ink-notes">{TRY_COPY.lead}</p>

      <PaperCard as="div" tilt={-0.8} className="mt-9 p-5">
        <Tape className="-top-3 left-8 -rotate-[5deg]" />
        <form onSubmit={submit} noValidate>
          <label htmlFor={nameId} className="block text-small text-ink">
            {TRY_COPY.nameLabel}
          </label>
          <div className="mt-2 flex gap-3">
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
                "h-14 min-w-0 flex-1 rounded-element border-2 bg-paper px-4 text-lead text-ink placeholder:text-ink-notes",
                error ? "border-danger" : "border-ink",
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
              className="btn size-14 shrink-0"
            >
              <Dices aria-hidden="true" className="size-6" />
            </button>
          </div>
          <p id={`${nameId}-error`} role="alert" className="mt-2 flex items-center gap-1.5 text-small text-danger empty:hidden">
            {error ? (
              <>
                <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
                {error}
              </>
            ) : null}
          </p>
          <Button type="submit" size="lg" block loading={busy} data-testid="try-start" className="mt-5">
            {busy ? TRY_COPY.starting : TRY_COPY.start}
          </Button>
        </form>
      </PaperCard>

      <p className="mt-7 rounded-element border-2 border-dashed border-ink-faint px-4 py-3 text-small text-ink-notes">{TRY_COPY.honest}</p>
    </section>
  );
}
