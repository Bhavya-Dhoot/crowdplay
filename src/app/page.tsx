// Landing page (UX_SPEC §3.1). A server component: the only client code on this route is the
// code form and the toast provider, so it stays light for Lighthouse. The "marquee" frame around
// the join form and the three looping scenes are pure CSS (see globals.css) and hold still under
// prefers-reduced-motion.
import { ArrowRight, Trophy, Zap } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { cn } from "@/components/ui/cn";
import { Footer } from "@/components/ui/Footer";
import { JoinCodeForm } from "@/components/ui/JoinCodeForm";
import { COPY, creditLine } from "@/lib/copy";

function LogoMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="8" cy="9" r="5.5" fill="var(--opt-a)" />
      <circle cx="20" cy="9" r="5.5" fill="var(--opt-b)" />
      <circle cx="14" cy="20" r="5.5" fill="var(--opt-c)" />
    </svg>
  );
}

const vars = (v: Record<string, string | number>): CSSProperties => v as CSSProperties;

const SCENE = "scene relative h-32 overflow-hidden rounded-card border border-line bg-surface";

// Sample ideas for the storm picture: decoration, not data.
const CHIPS = [
  { text: "a betrayal", left: "4%", top: "8%", d: "0s" },
  { text: "free pizza", left: "58%", top: "14%", d: "0.3s" },
  { text: "something falls", left: "18%", top: "40%", d: "0.7s" },
  { text: "plot twist", left: "66%", top: "46%", d: "1s" },
  { text: "a stranger appears", left: "3%", top: "70%", d: "1.3s" },
  { text: "dragon?", left: "62%", top: "72%", d: "1.6s" },
] as const;

function StormScene() {
  return (
    <div aria-hidden="true" className={SCENE}>
      {CHIPS.map((c) => (
        <span
          key={c.text}
          data-a
          style={vars({ left: c.left, top: c.top, "--d": c.d })}
          className="absolute rounded-pill border border-line bg-surface-2 px-3 py-1 text-[13px] whitespace-nowrap text-text"
        >
          {c.text}
        </span>
      ))}
    </div>
  );
}

const OPTION_BG = { a: "bg-opt-a", b: "bg-opt-b", c: "bg-opt-c" } as const;
const ROWS = [
  { letter: "A", tone: "a", w: 0.78, d: "2.1s" },
  { letter: "B", tone: "b", w: 0.52, d: "2.4s" },
  { letter: "C", tone: "c", w: 0.64, d: "2.7s" },
] as const;

function OptionsScene() {
  return (
    <div aria-hidden="true" className={cn(SCENE, "flex flex-col justify-center gap-3 px-4")}>
      {ROWS.map((r) => (
        <div key={r.letter} className="flex items-center gap-3">
          <span
            data-a
            style={vars({ "--d": r.d })}
            className={cn("grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold text-ink", OPTION_BG[r.tone])}
          >
            {r.letter}
          </span>
          <span className="h-3 flex-1 rounded-pill bg-surface-2">
            <span data-bar style={vars({ "--w": r.w, "--d": r.d })} className={cn("block h-full rounded-pill", OPTION_BG[r.tone])} />
          </span>
          {r.letter === "C" ? <Zap className="size-4 shrink-0 text-wild" /> : <span className="size-4 shrink-0" />}
        </div>
      ))}
    </div>
  );
}

function CreditScene() {
  return (
    <div aria-hidden="true" className={cn(SCENE, "flex flex-col justify-center gap-3 px-4")}>
      <div data-a style={vars({ "--d": "4s" })} className="flex items-center gap-3">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-opt-a text-xs font-bold text-ink">A</span>
        <span className="font-semibold">Pick the lock</span>
        <Trophy className="ml-auto size-5 text-accent" />
      </div>
      <span className="h-3 rounded-pill bg-surface-2">
        <span data-bar style={vars({ "--w": 1, "--d": "4.3s" })} className="block h-full rounded-pill bg-accent" />
      </span>
      <p data-a style={vars({ "--d": "5s" })} className="text-sm font-medium text-accent">
        ✨ {creditLine([{ name: "priya", bot: false }], 23)}
      </p>
    </div>
  );
}

const SCENES = [StormScene, OptionsScene, CreditScene];

const ACTION =
  "group flex min-h-[88px] flex-col justify-between gap-2 rounded-card border border-line bg-surface p-4 transition-colors hover:border-accent motion-reduce:transition-none";

export default function Landing() {
  const { landing } = COPY;
  return (
    <div className="stage-light flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 md:px-8">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 font-display text-xl font-extrabold tracking-tight">
          <LogoMark />
          {COPY.brand}
        </Link>
        <nav aria-label="Primary">
          <Link
            href="/how-it-works"
            className="inline-flex min-h-11 items-center rounded-pill px-3 text-sm font-medium text-muted transition-colors hover:text-text motion-reduce:transition-none"
          >
            {COPY.nav.howItWorks}
          </Link>
        </nav>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 md:px-8">
        <section aria-labelledby="hero-title" className="grid grid-cols-1 gap-8 pt-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-center lg:gap-14 lg:pt-14">
          <div>
            <h1 id="hero-title" className="hero-title">
              {landing.title}
            </h1>
            <p className="mt-6 max-w-[42ch] text-lg text-muted md:text-xl">{landing.sub}</p>
          </div>

          <div className="flex flex-col gap-4">
            <div className="marquee">
              <div className="rounded-card border border-line bg-surface p-4">
                <h2 className="font-display text-xl">{landing.join.heading}</h2>
                <p className="mt-1 mb-4 text-sm text-muted">{landing.join.hint}</p>
                <JoinCodeForm />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Link href="/host" className={ACTION}>
                <span className="flex items-center justify-between font-display text-lg font-bold">
                  {landing.host.label}
                  <ArrowRight aria-hidden="true" className="size-5 text-accent transition-transform group-hover:translate-x-1 motion-reduce:transition-none" />
                </span>
                <span className="text-sm text-muted">{landing.host.hint}</span>
              </Link>
              <Link href="/try" className={ACTION}>
                <span className="flex items-center justify-between font-display text-lg font-bold">
                  {landing.try.label}
                  <ArrowRight aria-hidden="true" className="size-5 text-accent transition-transform group-hover:translate-x-1 motion-reduce:transition-none" />
                </span>
                <span className="text-sm text-muted">{landing.try.hint}</span>
              </Link>
            </div>
          </div>
        </section>

        <section aria-labelledby="steps-title" className="mt-16 lg:mt-24">
          <h2 id="steps-title" className="font-display text-2xl md:text-3xl">
            {landing.stepsHeading}
          </h2>
          <ol className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-6">
            {landing.steps.map((step, i) => {
              const Scene = SCENES[i];
              return (
                <li key={step.title} className="flex flex-col gap-4">
                  <Scene />
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-accent font-display text-sm font-extrabold text-ink"
                    >
                      {i + 1}
                    </span>
                    <div>
                      <h3 className="font-display text-xl">{step.title}</h3>
                      <p className="mt-1 max-w-[40ch] text-muted">{step.body}</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </main>

      <Footer />
    </div>
  );
}
