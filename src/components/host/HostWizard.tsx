"use client";
// /host setup wizard (UX §3.4, PRD H1), design v3 "Live Sketchnote": ONE page of notes. Pick a story (paper boxes with a doodle,
// the chosen one circled by the pen), then Pace and rules (collapsed to one readable sentence), and an "admit one" ticket that
// previews the show next to the one yellow key. Name, title, premise, rounds and timings all start filled in, so the whole flow
// is: pick a story, press Create show.
// Create = ensureSession(hostName) -> createRoom -> remember the host key for this room -> /host/CODE?k=KEY.
// Validation is friendly and inline; server failures keep everything you typed.
import { ChevronDown, Dices, Scissors, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useSyncExternalStore, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Banner, NumberBanner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { tiltOf } from "@/components/ui/doodle";
import { Footer } from "@/components/ui/Footer";
import { InkUnderline } from "@/components/ui/InkUnderline";
import { PaperCard, paperCardClass } from "@/components/ui/PaperCard";
import { PenCheck } from "@/components/ui/PenCheck";
import { PenLoop } from "@/components/ui/PenLoop";
import { Skeleton } from "@/components/ui/Skeleton";
import { StageBackdrop } from "@/components/ui/StageBackdrop";
import { createRoom } from "@/lib/client/api";
import { ensureSession, getStoredName } from "@/lib/client/session";
import { COPY, friendlyError, randomName } from "@/lib/copy";
import { PRESETS } from "@/lib/presets";
import type { PresetId } from "@/lib/realtime/types";
import { LogoMark } from "@/components/ui/LogoMark";
import { FIELD, Segmented, Switch } from "./controls";
import { hostPath, saveHostKey } from "./hostKey";
import "./host.css";
import { PresetDoodle } from "./PresetDoodle";
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

function ErrorLine({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="mt-2 flex items-start gap-2 text-small text-danger">
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
  );
}

function Field({ id, label, error, hint, counter, children }: { id: string; label: string; error?: string; hint?: string; counter?: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="font-display text-small">
          {label}
        </label>
        {counter ? <span className="text-small tabular-nums text-ink-notes">{counter}</span> : null}
      </div>
      {children}
      {error ? (
        <ErrorLine id={`${id}-msg`}>{error}</ErrorLine>
      ) : hint ? (
        <p id={`${id}-msg`} className="mt-2 text-small text-ink-notes">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function WizardSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]" aria-busy="true">
      <span className="sr-only">Loading the setup…</span>
      <div className="space-y-8">
        <Skeleton className="h-[460px] rounded-card" />
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
  const ids = { hostName: useId(), title: useId(), premise: useId(), rounds: useId(), story: useId() };

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
    <form noValidate onSubmit={(e) => void submit(e)} className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8" data-testid="host-wizard">
      <fieldset disabled={submitting} className="min-w-0 space-y-10">
        <legend className="sr-only">Set up your show</legend>

        <section aria-labelledby={ids.story} className="paper relative p-5 pt-9 md:p-6 md:pt-10">
          <h2 id={ids.story} className="absolute -top-[18px] left-4">
            <NumberBanner n={1} label="Pick a story" />
          </h2>
          <p className="text-small text-ink-notes">The AI starts from this premise. Change any of it, or leave it as it is.</p>

          <div role="radiogroup" aria-label="Story" className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-3">
            {PRESET_ORDER.map((id, i) => {
              const p = PRESETS[id];
              const on = form.preset === id;
              return (
                <div key={id} className="relative">
                  <label
                    data-testid={`preset-${id}`}
                    style={{ "--tilt": `${tiltOf(`preset-${id}`, 1.2)}deg` } as CSSProperties}
                    className={paperCardClass({
                      pressable: true,
                      alt: i % 2 === 1,
                      className: cn(
                        "flex min-h-[148px] cursor-pointer flex-col gap-1 p-3 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-ink",
                        on ? "shadow-marker" : "shadow-slip",
                      ),
                    })}
                  >
                    <input type="radio" name="preset" value={id} checked={on} onChange={() => pickPreset(id)} className="sr-only" />
                    <PresetDoodle id={id} className="size-12" />
                    <span className="mt-1 font-display text-small leading-5">{p.name}</span>
                    <span className="text-small leading-5 text-ink-notes">{PRESET_BLURB[id]}</span>
                    {on ? <PenCheck size={22} seed={`preset-${id}`} className="absolute top-3 right-3" /> : null}
                  </label>
                  {on ? (
                    <PenLoop seed={`preset-${id}`} shape="round" className="pointer-events-none absolute inset-0 block">
                      <span className="block size-full" />
                    </PenLoop>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="mt-7 space-y-5">
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
                className={cn(FIELD, "min-h-28 resize-y py-3 leading-7")}
              />
            </Field>
          </div>
        </section>

        <details className="group paper paper-alt relative" data-testid="wizard-pace">
          <summary className="flex min-h-20 cursor-pointer list-none items-center justify-between gap-4 rounded-card px-5 pt-7 pb-4 md:px-6 [&::-webkit-details-marker]:hidden">
            <span aria-hidden="true" className="absolute -top-[18px] left-4">
              <NumberBanner n={2} label="Pace and rules" />
            </span>
            <span className="min-w-0">
              <span className="sr-only">Pace and rules. </span>
              <span className="block text-small text-ink-notes" data-testid="wizard-pace-summary">
                {paceSummary(form)}
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1.5 font-display text-small">
              <span className="group-open:hidden">Change</span>
              <span className="hidden group-open:inline">Done</span>
              <ChevronDown aria-hidden="true" className="size-4 transition-transform duration-175 ease-arrive group-open:rotate-180 motion-reduce:transition-none" />
            </span>
          </summary>
          <div className="space-y-6 border-t-2 border-dashed border-ink-faint p-5 md:p-6">
            <div>
              <div className="mb-1 flex items-baseline justify-between">
                <label htmlFor={ids.rounds} className="font-display text-small">
                  Rounds
                </label>
                <output htmlFor={ids.rounds} className="font-display text-h3 leading-8 tabular-nums">
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
              <div aria-hidden="true" className="flex justify-between px-[14px] text-small tabular-nums text-ink-notes">
                {Array.from({ length: MAX_ROUNDS - MIN_ROUNDS + 1 }, (_, i) => (
                  <span key={i}>{MIN_ROUNDS + i}</span>
                ))}
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 font-display text-small">Idea storm</p>
                <Segmented name="storm" label="Idea storm length" options={STORM_SECONDS} value={form.stormS} onChange={(v) => set("stormS", v)} format={(s) => `${s} s`} testIdPrefix="wizard-storm" />
              </div>
              <div>
                <p className="mb-1.5 font-display text-small">Voting</p>
                <Segmented name="vote" label="Voting length" options={VOTE_SECONDS} value={form.voteS} onChange={(v) => set("voteS", v)} format={(s) => `${s} s`} testIdPrefix="wizard-vote" />
              </div>
            </div>
            <div className="space-y-1">
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

      <aside aria-label="Your show" className="space-y-6 lg:sticky lg:top-6">
        <PaperCard as="div" tilt={-0.6} className="relative px-5 pt-7 pb-5">
          <Banner size="sm" className="absolute -top-[14px] right-3" seed="admit-one">
            Admit one
          </Banner>
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-blob border-2 border-ink bg-marker-1">
              <PresetDoodle id={form.preset} className="size-10" />
            </span>
            <div className="min-w-0">
              <p className="line-clamp-2 font-display text-lead leading-6" data-testid="wizard-ticket-title">
                {form.title.trim() || "Untitled show"}
              </p>
              <p className="truncate text-small text-ink-notes">
                {preset.name}, hosted by {form.hostName.trim() || "you"}
              </p>
            </div>
          </div>
          <div aria-hidden="true" className="my-4 flex items-center gap-2 text-ink-faint">
            <Scissors className="size-4 shrink-0 -scale-x-100" />
            <span className="flex-1 border-t-2 border-dashed border-ink-faint" />
          </div>
          <dl className="grid grid-cols-3 gap-2 text-center">
            {[
              { k: "Rounds", v: String(form.rounds) },
              { k: "Ideas", v: `${form.stormS} s` },
              { k: "Voting", v: `${form.voteS} s` },
            ].map((s) => (
              <div key={s.k}>
                <dd className="font-display text-h3 leading-8 tabular-nums">{s.v}</dd>
                <dt className="text-small text-ink-notes">{s.k}</dt>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-small text-ink-notes">
            {form.autoAdvance ? `Runs itself, up to about ${minutes} min.` : "You press Next round after each reveal."}
            {form.strictFilter ? " Strict filter on." : " Strict filter off."}
          </p>
        </PaperCard>

        <div>
          <label htmlFor={ids.hostName} className="mb-1.5 block font-display text-small">
            Hosted by <span className="font-sans text-ink-notes">(players see this on the join screen)</span>
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
              className="press grid size-12 shrink-0 place-items-center rounded-blob border-2 border-ink bg-paper-raised text-ink shadow-[2px_3px_0_var(--marker-2)] disabled:opacity-50"
            >
              <Dices aria-hidden="true" className="size-5" />
            </button>
          </div>
          {errors.hostName ? (
            <ErrorLine id={`${ids.hostName}-msg`}>{errors.hostName}</ErrorLine>
          ) : (
            <p className="mt-2 text-small tabular-nums text-ink-notes">
              {[...form.hostName].length}/{NAME_MAX}
            </p>
          )}
        </div>

        {serverError ? (
          <p role="alert" data-testid="wizard-error" className="slip flex items-start gap-2 rounded-card border-danger p-3 text-small text-danger">
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

        <div>
          <Button type="submit" variant="primary" size="lg" block loading={submitting} data-testid="wizard-create">
            {submitting ? "Setting the stage…" : "Create show"}
          </Button>
          <p className="mt-4 text-center text-small text-ink-notes">You get a join code, a QR and a private host link.</p>
        </div>
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
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 font-display text-lead">
          <LogoMark size={32} />
          {COPY.brand}
        </Link>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pt-2 pb-16 md:px-8">
        <div className="mb-10 max-w-2xl">
          <h1 className="text-h1 leading-[1.1]">
            Set the <InkUnderline seed="host-stage">stage</InkUnderline>
          </h1>
          <p className="mt-4 text-lead text-ink-notes">Pick a story, press Create show, share the code. Everything else is already filled in.</p>
        </div>
        {mounted ? <WizardBody /> : <WizardSkeleton />}
      </main>
      <Footer />
    </div>
  );
}
