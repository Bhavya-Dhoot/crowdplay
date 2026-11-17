"use client";
// "Playing as Brave Otter [pencil]": the judge's name in the demo, editable at any time. The demo starts with a
// random name (the landing button goes straight in); a change goes through the same session call as the intro.
import { Check, Pencil, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { cn } from "@/components/ui/cn";
import { ensureSession } from "@/lib/client/session";
import { friendlyError } from "@/lib/copy";
import { TRY_COPY } from "./tryCopy";

export function NameEdit({ name, onSaved, className }: { name: string; onSaved: (name: string) => void; className?: string }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const next = draft.trim();
    if (busy) return;
    if (next === name) return setEditing(false);
    if (next.length < 2) return setError(TRY_COPY.nameShort);
    setBusy(true);
    const res = await ensureSession(next, { force: true });
    setBusy(false);
    if (!res.ok) return setError(friendlyError(res.code, res.message));
    onSaved(res.session.displayName);
    setEditing(false);
    setError(null);
  }

  if (!editing) {
    return (
      <p className={cn("flex min-h-11 items-center gap-1 text-small text-muted-on-stage", className)}>
        {TRY_COPY.name.playingAs}
        <span data-testid="try-name" className="font-semibold text-on-stage">
          {name}
        </span>
        <button
          type="button"
          onClick={() => {
            setDraft(name);
            setEditing(true);
          }}
          aria-label={TRY_COPY.name.change}
          title={TRY_COPY.name.change}
          className="press inline-flex size-11 items-center justify-center rounded-pill text-muted-on-stage [--press-overlay:rgb(255_255_255/0.1)] hover:text-on-stage"
        >
          <Pencil aria-hidden="true" className="size-4" />
        </button>
      </p>
    );
  }

  return (
    <form onSubmit={save} noValidate className={cn("flex flex-wrap items-center gap-2", className)}>
      <label htmlFor={id} className="sr-only">
        {TRY_COPY.nameLabel}
      </label>
      <input
        ref={input}
        id={id}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(null);
        }}
        maxLength={20}
        autoComplete="nickname"
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="h-11 min-w-0 flex-1 rounded-element border border-stage-line bg-stage-2 px-3 text-body text-on-stage focus:border-gold focus:outline-none"
      />
      <button
        type="submit"
        disabled={busy}
        aria-label={busy ? TRY_COPY.name.saving : TRY_COPY.name.save}
        className="press inline-flex size-11 items-center justify-center rounded-pill bg-gold text-ink disabled:opacity-60"
      >
        <Check aria-hidden="true" className="size-5" />
      </button>
      <button
        type="button"
        onClick={() => {
          setEditing(false);
          setError(null);
        }}
        aria-label={TRY_COPY.name.cancel}
        className="press inline-flex size-11 items-center justify-center rounded-pill text-muted-on-stage [--press-overlay:rgb(255_255_255/0.1)] hover:text-on-stage"
      >
        <X aria-hidden="true" className="size-5" />
      </button>
      <p id={`${id}-error`} role="alert" className="w-full text-fine text-danger empty:hidden">
        {error}
      </p>
    </form>
  );
}
