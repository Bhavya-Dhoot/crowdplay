"use client";
// /host setup wizard (UX §3.4, PRD H1): name -> story -> pace -> rules -> Create.
// One scrolling form with a sticky "ticket" on desktop that summarises the show and holds the Create
// button. Create = ensureSession(hostName) -> createRoom -> remember the host key for this room ->
// /host/CODE?k=KEY. Validation is friendly and inline; server failures keep everything you typed.
import { Check, Dices, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useSyncExternalStore, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { Footer } from "@/components/ui/Footer";
import { Skeleton } from "@/components/ui/Skeleton";
import { createRoom } from "@/lib/client/api";
import { ensureSession, getStoredName } from "@/lib/client/session";
import { COPY, friendlyError, randomName } from "@/lib/copy";
import { PRESETS } from "@/lib/presets";
import type { PresetId } from "@/lib/realtime/types";
import { Segmented, Switch } from "./controls";
import { hostPath, saveHostKey } from "./hostKey";
import "./host.css";
import {
  estimateMinutes,
  initialForm,
  MAX_ROUNDS,
  MIN_ROUNDS,
  NAME_MAX,
  nextPremise,
  nextTitle,
  PREMISE_MAX,
  PRESET_BLURB,
  PRESET_ORDER,
  sliderFill,
  STORM_SECONDS,
  TITLE_MAX,
  validateWizard,
  VOTE_SECONDS,
  type WizardErrors,
  type WizardField,
  type WizardForm,
} from "./wizardLogic";

const FIELD =
  "min-h-12 w-full rounded-card border border-line bg-surface-2 px-4 text-base text-text placeholder:text-muted/70 transition-colors hover:border-muted focus-visible:border-accent aria-[invalid=true]:border-danger motion-reduce:transition-none";

function LogoMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="8" cy="9" r="5.5" fill="var(--opt-a)" />
      <circle cx="20" cy="9" r="5.5" fill="var(--opt-b)" />
      <circle cx="14" cy="20" r="5.5" fill="var(--opt-c)" />
    </svg>
  );
}

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="rounded-card border border-line bg-surface p-5 md:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span aria-hidden="true" className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 font-display text-sm font-extrabold text-accent ring-1 ring-line">
          {n}
        </span>
        <div>
          <h2 id={id} className="font-display text-xl leading-7">
            {title}
          </h2>
          {hint ? <p className="text-sm text-muted">{hint}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({ id, label, error, hint, counter, children }: { id: string; label: string; error?: string; hint?: string; counter?: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold">
          {label}
        </label>
        {counter ? <span className="text-xs tabular-nums text-muted">{counter}</span> : null}
      </div>
      {children}
      {error ? (
        <p id={`${id}-msg`} role="alert" className="mt-1.5 flex items-start gap-1.5 text-sm text-danger">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-msg`} className="mt-1.5 text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function WizardSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]" aria-busy="true">
      <span className="sr-only">Loading the setup…</span>
      <div className="space-y-6">
        <Skeleton className="h-40 rounded-card" />
        <Skeleton className="h-64 rounded-card" />
        <Skeleton className="h-48 rounded-card" />
      </div>
      <Skeleton className="hidden h-96 rounded-card lg:block" />
    </div>
  );
}

const noopSubscribe = () => () => {};

function WizardBody() {
  const router = useRouter();
  const [form, setForm] = useState<WizardForm>(() => initialForm(getStoredName() ?? randomName()));
  const [errors, setErrors] = useState<WizardErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const refs = useRef<Partial<Record<WizardField, HTMLInputElement | HTMLTextAreaElement | null>>>({});
  const ids = { hostName: useId(), title: useId(), premise: useId(), rounds: useId() };

  const set = <K extends keyof WizardForm>(key: K, value: WizardForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (key === "hostName" || key === "title" || key === "premise") setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const pickPreset = (preset: PresetId) =>
    setForm((f) => ({
      ...f,
      preset,
      premise: nextPremise(f.preset, f.premise, preset),
      title: nextTitle(f.preset, f.title, preset),
    }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setServerError(null);
    const v = validateWizard(form);
    if (!v.ok) {
      setErrors(v.errors);
      const first = (["hostName", "title", "premise"] as const).find((k) => v.errors[k]);
      if (first) refs.current[first]?.focus();
      return;
    }
    setErrors({});
    setSubmitting(true);
    const session = await ensureSession(v.hostName);
    if (!session.ok) {
      setSubmitting(false);
      if (session.code === "NAME_BLOCKED") {
        setErrors({ hostName: friendlyError("NAME_BLOCKED") });
        refs.current.hostName?.focus();
      } else setServerError(session.message);
      return;
    }
    const made = await createRoom(v.body);
    if (!made.ok) {
      setSubmitting(false);
      setServerError(made.message);
      return;
    }
    saveHostKey(made.code, made.hostKey);
    router.push(hostPath(made.code, made.hostKey));
  };

  const preset = PRESETS[form.preset];
  const minutes = estimateMinutes(form.rounds, form.stormS, form.voteS);

  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]" data-testid="host-wizard">
      <fieldset disabled={submitting} className="min-w-0 space-y-6">
        <legend className="sr-only">Set up your show</legend>

        <Step n={1} title="Who's hosting?" hint="Players see this name on the join screen.">
          <Field id={ids.hostName} label="Your name" error={errors.hostName} counter={`${[...form.hostName].length}/${NAME_MAX}`}>
            <div className="flex gap-2">
              <input
                ref={(el) => {
                  refs.current.hostName = el;
                }}
                id={ids.hostName}
                data-testid="wizard-host-name"
                value={form.hostName}
                onChange={(e) => set("hostName", e.target.value)}
                autoComplete="nickname"
                aria-invalid={Boolean(errors.hostName)}
                aria-describedby={errors.hostName ? `${ids.hostName}-msg` : undefined}
                className={FIELD}
              />
              <button
                type="button"
                aria-label="Pick another random name"
                title="Pick another random name"
                onClick={() => set("hostName", randomName())}
                className="grid size-12 shrink-0 place-items-center rounded-card border border-line bg-surface-2 text-muted transition-colors hover:border-accent hover:text-accent motion-reduce:transition-none"
              >
                <Dices aria-hidden="true" className="size-5" />
              </button>
            </div>
          </Field>
        </Step>

        <Step n={2} title="Pick a story" hint="The AI starts from this premise. Edit it freely.">
          <div role="radiogroup" aria-label="Story" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {PRESET_ORDER.map((id) => {
              const p = PRESETS[id];
              const on = form.preset === id;
              return (
                <label
                  key={id}
                  data-testid={`preset-${id}`}
                  className={cn(
                    "relative flex min-h-[116px] cursor-pointer flex-col gap-1.5 rounded-card border bg-surface-2 p-4 transition-[border-color,box-shadow] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent motion-reduce:transition-none",
                    on ? "border-accent glow-accent" : "border-line hover:border-muted",
                  )}
                >
                  <input type="radio" name="preset" value={id} checked={on} onChange={() => pickPreset(id)} className="sr-only" />
                  <span aria-hidden="true" className="text-3xl leading-none">
                    {p.emoji}
                  </span>
                  <span className="font-display text-base leading-5 font-extrabold">{p.name}</span>
                  <span className="text-[13px] leading-[18px] text-muted">{PRESET_BLURB[id]}</span>
                  {on ? (
                    <span aria-hidden="true" className="absolute top-3 right-3 grid size-6 place-items-center rounded-full bg-accent text-ink">
                      <Check className="size-4" />
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>

          <div className="mt-5 space-y-4">
            <Field id={ids.title} label="Show title" error={errors.title} counter={`${[...form.title].length}/${TITLE_MAX}`}>
              <input
                ref={(el) => {
                  refs.current.title = el;
                }}
                id={ids.title}
                data-testid="wizard-title"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                aria-invalid={Boolean(errors.title)}
                aria-describedby={errors.title ? `${ids.title}-msg` : undefined}
                className={FIELD}
              />
            </Field>
            <Field
              id={ids.premise}
              label="Premise"
              error={errors.premise}
              hint={form.preset === "custom" ? "Required. Describe the world, who is in it and what is at stake." : undefined}
              counter={`${[...form.premise].length}/${PREMISE_MAX}`}
            >
              <textarea
                ref={(el) => {
                  refs.current.premise = el;
                }}
                id={ids.premise}
                data-testid="wizard-premise"
                rows={5}
                value={form.premise}
                onChange={(e) => set("premise", e.target.value)}
                placeholder={form.preset === "custom" ? "A lighthouse keeper finds a door in the sea…" : undefined}
                aria-invalid={Boolean(errors.premise)}
                aria-describedby={errors.premise || form.preset === "custom" ? `${ids.premise}-msg` : undefined}
                className={cn(FIELD, "min-h-32 resize-y py-3 leading-6")}
              />
            </Field>
          </div>
        </Step>

        <Step n={3} title="Set the pace" hint="Short rounds keep a crowd moving.">
          <div className="space-y-5">
            <div>
              <div className="mb-1 flex items-baseline justify-between">
                <label htmlFor={ids.rounds} className="text-sm font-semibold">
                  Rounds
                </label>
                <output htmlFor={ids.rounds} className="font-display text-2xl font-extrabold tabular-nums text-accent">
                  {form.rounds}
                </output>
              </div>
              <input
                id={ids.rounds}
                data-testid="wizard-rounds"
                type="range"
                min={MIN_ROUNDS}
                max={MAX_ROUNDS}
                step={1}
                value={form.rounds}
                onChange={(e) => set("rounds", Number(e.target.value))}
                aria-valuetext={`${form.rounds} rounds`}
                className="host-range"
                style={{ "--fill": `${sliderFill(form.rounds)}%` } as CSSProperties}
              />
              <div aria-hidden="true" className="flex justify-between px-[14px] text-xs tabular-nums text-muted">
                {Array.from({ length: MAX_ROUNDS - MIN_ROUNDS + 1 }, (_, i) => (
                  <span key={i}>{MIN_ROUNDS + i}</span>
                ))}
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-sm font-semibold">
                  Idea storm
                </p>
                <Segmented name="storm" label="Idea storm length" options={STORM_SECONDS} value={form.stormS} onChange={(v) => set("stormS", v)} format={(s) => `${s} s`} testIdPrefix="wizard-storm" />
              </div>
              <div>
                <p className="mb-1.5 text-sm font-semibold">Voting</p>
                <Segmented name="vote" label="Voting length" options={VOTE_SECONDS} value={form.voteS} onChange={(v) => set("voteS", v)} format={(s) => `${s} s`} testIdPrefix="wizard-vote" />
              </div>
            </div>
          </div>
        </Step>

        <Step n={4} title="Ground rules">
          <div className="space-y-3">
            <Switch
              checked={form.autoAdvance}
              onChange={(v) => set("autoAdvance", v)}
              label="Auto-advance"
              hint="Rounds flow on their own. Off: you press Next round after each reveal."
              testId="wizard-auto"
            />
            <Switch
              checked={form.strictFilter}
              onChange={(v) => set("strictFilter", v)}
              label="Strict filter"
              hint="Keeps ideas friendly. Blocked words never reach the big screen."
              testId="wizard-strict"
            />
          </div>
        </Step>
      </fieldset>

      <aside aria-label="Your show" className="lg:sticky lg:top-6">
        <div className="marquee">
          <div className="rounded-card border border-line bg-surface p-5">
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-2xl bg-surface-2 text-3xl ring-1 ring-line">
                {preset.emoji}
              </span>
              <div className="min-w-0">
                <p className="line-clamp-2 font-display text-xl leading-6 font-extrabold" data-testid="wizard-ticket-title">
                  {form.title.trim() || "Untitled show"}
                </p>
                <p className="truncate text-sm text-muted">
                  {preset.name} · hosted by {form.hostName.trim() || "you"}
                </p>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              {[
                { k: "Rounds", v: String(form.rounds) },
                { k: "Storm", v: `${form.stormS} s` },
                { k: "Vote", v: `${form.voteS} s` },
              ].map((s) => (
                <div key={s.k} className="rounded-card bg-surface-2 py-2.5">
                  <dd className="font-display text-xl leading-6 font-extrabold tabular-nums">{s.v}</dd>
                  <dt className="text-xs text-muted">{s.k}</dt>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-sm text-muted">
              {form.autoAdvance ? `Runs itself, up to about ${minutes} min.` : "You press Next round after each reveal."}
              {form.strictFilter ? " Strict filter on." : " Strict filter off."}
            </p>

            {serverError ? (
              <p role="alert" data-testid="wizard-error" className="mt-4 flex items-start gap-2 rounded-card border border-danger/60 bg-danger/10 p-3 text-sm text-danger">
                <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                {serverError}
              </p>
            ) : null}
            {Object.values(errors).some(Boolean) ? (
              <p role="alert" className="mt-4 text-sm text-danger">
                Fix the highlighted fields to continue.
              </p>
            ) : null}

            <Button type="submit" size="lg" block loading={submitting} data-testid="wizard-create" className="mt-5">
              {submitting ? "Setting the stage…" : "Create show"}
            </Button>
            <p className="mt-3 text-center text-[13px] text-muted">You get a join code, a QR and a private host link.</p>
          </div>
        </div>
      </aside>
    </form>
  );
}

export function HostWizard() {
  // The name is random and the form reads browser storage, so render it only after hydration.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  return (
    <div className="stage-light flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 md:px-8">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 font-display text-xl font-extrabold tracking-tight">
          <LogoMark />
          {COPY.brand}
        </Link>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-14 md:px-8">
        <div className="mb-6 max-w-2xl md:mb-8">
          <h1 className="font-display text-4xl leading-[1.02] md:text-6xl">Set the stage</h1>
          <p className="mt-3 text-lg text-muted">Pick a story, set the pace, share the code. The room does the rest.</p>
        </div>
        {mounted ? <WizardBody /> : <WizardSkeleton />}
      </main>
      <Footer />
    </div>
  );
}
