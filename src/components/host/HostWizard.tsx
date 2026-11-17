"use client";
// /host setup wizard (UX §3.4, PRD H1), design v2. The aim is zero headache: pick a story and press Create.
// Name, title, premise, rounds and timings all start filled in; pace and rules sit in a collapsed row that
// reads out the defaults. A paper "ticket" previews the show next to the one gold button.
// Create = ensureSession(hostName) -> createRoom -> remember the host key for this room -> /host/CODE?k=KEY.
// Validation is friendly and inline; server failures keep everything you typed.
import { Check, ChevronDown, Dices, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useSyncExternalStore, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { Footer } from "@/components/ui/Footer";
import { PaperCard } from "@/components/ui/PaperCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { StageBackdrop } from "@/components/ui/StageBackdrop";
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
  paceSummary,
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
  "min-h-12 w-full rounded-element border border-stage-line bg-stage-2 px-4 text-body text-on-stage placeholder:text-muted-on-stage/70 hover:border-muted-on-stage/50 aria-[invalid=true]:border-danger";

function LogoMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="8" cy="9" r="5.5" fill="var(--gel-a)" />
      <circle cx="20" cy="9" r="5.5" fill="var(--gel-b)" />
      <circle cx="14" cy="20" r="5.5" fill="var(--gel-c)" />
    </svg>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="rounded-card border border-stage-line bg-stage-1 p-5 md:p-6">
      <h2 id={id} className="font-display text-h3 leading-8">
        {title}
      </h2>
      {hint ? <p className="mt-1 text-small text-muted-on-stage">{hint}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Field({ id, label, error, hint, counter, children }: { id: string; label: string; error?: string; hint?: string; counter?: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-small font-semibold">
          {label}
        </label>
        {counter ? <span className="text-fine tabular-nums text-muted-on-stage">{counter}</span> : null}
      </div>
      {children}
      {error ? (
        <p id={`${id}-msg`} role="alert" className="mt-1.5 flex items-start gap-1.5 text-small text-danger">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-msg`} className="mt-1.5 text-fine text-muted-on-stage">
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
        <Skeleton className="h-[420px] rounded-card" />
        <Skeleton className="h-20 rounded-card" />
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
      const first = (["title", "premise", "hostName"] as const).find((k) => v.errors[k]);
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
  const hasErrors = Object.values(errors).some(Boolean);

  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]" data-testid="host-wizard">
      <fieldset disabled={submitting} className="min-w-0 space-y-6">
        <legend className="sr-only">Set up your show</legend>

        <Panel title="Pick a story" hint="The AI starts from this premise. Change any of it, or leave it as it is.">
          <div role="radiogroup" aria-label="Story" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {PRESET_ORDER.map((id) => {
              const p = PRESETS[id];
              const on = form.preset === id;
              return (
                <label
                  key={id}
                  data-testid={`preset-${id}`}
                  className={cn(
                    "press relative flex min-h-[116px] cursor-pointer flex-col gap-1 rounded-element border p-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gold",
                    on
                      ? "border-paper bg-paper text-ink shadow-contact"
                      : "border-stage-line bg-stage-2 text-on-stage hover:border-muted-on-stage/50 [--press-overlay:rgb(255_255_255/0.07)]",
                  )}
                >
                  <input type="radio" name="preset" value={id} checked={on} onChange={() => pickPreset(id)} className="sr-only" />
                  <span aria-hidden="true" className="text-3xl leading-none">
                    {p.emoji}
                  </span>
                  <span className="mt-1 font-display text-small leading-5 font-extrabold">{p.name}</span>
                  <span className={cn("text-fine leading-[18px]", on ? "text-ink-muted" : "text-muted-on-stage")}>{PRESET_BLURB[id]}</span>
                  {on ? (
                    <span aria-hidden="true" className="absolute top-3 right-3 grid size-6 place-items-center rounded-full bg-ink text-paper">
                      <Check className="size-4" strokeWidth={3} />
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>

          <div className="mt-6 space-y-4">
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
                rows={4}
                value={form.premise}
                onChange={(e) => set("premise", e.target.value)}
                placeholder={form.preset === "custom" ? "A lighthouse keeper finds a door in the sea…" : undefined}
                aria-invalid={Boolean(errors.premise)}
                aria-describedby={errors.premise || form.preset === "custom" ? `${ids.premise}-msg` : undefined}
                className={cn(FIELD, "min-h-28 resize-y py-3 font-script leading-7")}
              />
            </Field>
          </div>
        </Panel>

        <details className="group rounded-card border border-stage-line bg-stage-1" data-testid="wizard-pace">
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 rounded-card px-5 py-3 md:px-6 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0">
              <span className="block font-display text-h3 leading-8 font-extrabold">Pace and rules</span>
              <span className="mt-0.5 block text-small text-muted-on-stage" data-testid="wizard-pace-summary">
                {paceSummary(form)}
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-small font-semibold">
              <span className="group-open:hidden">Change</span>
              <span className="hidden group-open:inline">Done</span>
              <ChevronDown aria-hidden="true" className="size-4 transition-transform duration-175 ease-arrive group-open:rotate-180 motion-reduce:transition-none" />
            </span>
          </summary>
          <div className="space-y-6 border-t border-stage-line p-5 md:p-6">
            <div>
              <div className="mb-1 flex items-baseline justify-between">
                <label htmlFor={ids.rounds} className="text-small font-semibold">
                  Rounds
                </label>
                <output htmlFor={ids.rounds} className="font-display text-h3 leading-8 font-extrabold tabular-nums">
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
              <div aria-hidden="true" className="flex justify-between px-[14px] text-fine tabular-nums text-muted-on-stage">
                {Array.from({ length: MAX_ROUNDS - MIN_ROUNDS + 1 }, (_, i) => (
                  <span key={i}>{MIN_ROUNDS + i}</span>
                ))}
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-small font-semibold">Idea storm</p>
                <Segmented name="storm" label="Idea storm length" options={STORM_SECONDS} value={form.stormS} onChange={(v) => set("stormS", v)} format={(s) => `${s} s`} testIdPrefix="wizard-storm" />
              </div>
              <div>
                <p className="mb-1.5 text-small font-semibold">Voting</p>
                <Segmented name="vote" label="Voting length" options={VOTE_SECONDS} value={form.voteS} onChange={(v) => set("voteS", v)} format={(s) => `${s} s`} testIdPrefix="wizard-vote" />
              </div>
            </div>
            <div className="space-y-2">
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
          </div>
        </details>
      </fieldset>

      <aside aria-label="Your show" className="space-y-4 lg:sticky lg:top-6">
        <PaperCard as="div" className="overflow-hidden p-5">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-full bg-paper-2 text-3xl ring-1 ring-paper-edge">
              {preset.emoji}
            </span>
            <div className="min-w-0">
              <p className="line-clamp-2 font-script text-lead leading-6 font-semibold text-ink" data-testid="wizard-ticket-title">
                {form.title.trim() || "Untitled show"}
              </p>
              <p className="truncate text-small text-ink-muted">
                {preset.name}, hosted by {form.hostName.trim() || "you"}
              </p>
            </div>
          </div>
          <div aria-hidden="true" className="relative my-4 border-t-2 border-dashed border-paper-edge">
            <span className="absolute -top-2.5 -left-[30px] size-5 rounded-full bg-stage-0" />
            <span className="absolute -top-2.5 -right-[30px] size-5 rounded-full bg-stage-0" />
          </div>
          <dl className="grid grid-cols-3 gap-2 text-center">
            {[
              { k: "Rounds", v: String(form.rounds) },
              { k: "Ideas", v: `${form.stormS} s` },
              { k: "Voting", v: `${form.voteS} s` },
            ].map((s) => (
              <div key={s.k}>
                <dd className="font-display text-h3 leading-8 font-extrabold tabular-nums text-ink">{s.v}</dd>
                <dt className="text-fine text-ink-muted">{s.k}</dt>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-small text-ink-muted">
            {form.autoAdvance ? `Runs itself, up to about ${minutes} min.` : "You press Next round after each reveal."}
            {form.strictFilter ? " Strict filter on." : " Strict filter off."}
          </p>
        </PaperCard>

        <div>
          <label htmlFor={ids.hostName} className="mb-1.5 block text-small font-semibold">
            Hosted by <span className="font-normal text-muted-on-stage">(players see this on the join screen)</span>
          </label>
          <div className="flex gap-2">
            <input
              ref={(el) => {
                refs.current.hostName = el;
              }}
              id={ids.hostName}
              data-testid="wizard-host-name"
              value={form.hostName}
              onChange={(e) => set("hostName", e.target.value)}
              disabled={submitting}
              autoComplete="nickname"
              aria-invalid={Boolean(errors.hostName)}
              aria-describedby={errors.hostName ? `${ids.hostName}-msg` : undefined}
              className={FIELD}
            />
            <button
              type="button"
              aria-label="Pick another random name"
              title="Pick another random name"
              disabled={submitting}
              onClick={() => set("hostName", randomName())}
              className="press grid size-12 shrink-0 place-items-center rounded-element border border-stage-line bg-stage-2 text-muted-on-stage [--press-overlay:rgb(255_255_255/0.08)] hover:text-on-stage disabled:opacity-50"
            >
              <Dices aria-hidden="true" className="size-5" />
            </button>
          </div>
          {errors.hostName ? (
            <p id={`${ids.hostName}-msg`} role="alert" className="mt-1.5 flex items-start gap-1.5 text-small text-danger">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {errors.hostName}
            </p>
          ) : (
            <p className="mt-1.5 text-fine text-muted-on-stage">{[...form.hostName].length}/{NAME_MAX}</p>
          )}
        </div>

        {serverError ? (
          <p role="alert" data-testid="wizard-error" className="flex items-start gap-2 rounded-card border border-danger/60 bg-danger/10 p-3 text-small text-danger">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {serverError}
          </p>
        ) : null}
        {hasErrors ? (
          <p role="alert" className="flex items-start gap-2 text-small text-danger">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            Fix the highlighted fields to continue.
          </p>
        ) : null}

        <Button type="submit" variant="primary" size="lg" block loading={submitting} data-testid="wizard-create">
          {submitting ? "Setting the stage…" : "Create show"}
        </Button>
        <p className="text-center text-fine text-muted-on-stage">You get a join code, a QR and a private host link.</p>
      </aside>
    </form>
  );
}

export function HostWizard() {
  // The name is random and the form reads browser storage, so render it only after hydration.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  return (
    <div className="flex min-h-dvh flex-col">
      <StageBackdrop />
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 md:px-8">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 font-display text-lead font-extrabold tracking-tight">
          <LogoMark />
          {COPY.brand}
        </Link>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-14 md:px-8">
        <div className="mb-6 max-w-2xl md:mb-8">
          <h1 className="font-display text-h1 leading-[1.05] md:text-screen-lg">Set the stage</h1>
          <p className="mt-3 text-lead text-muted-on-stage">Pick a story, press Create show, share the code. Everything else is already filled in.</p>
        </div>
        {mounted ? <WizardBody /> : <WizardSkeleton />}
      </main>
      <Footer />
    </div>
  );
}
