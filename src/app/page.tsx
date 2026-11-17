// Landing page (design-v3 "Live Sketchnote"): one page of notes. A server component: the only client code on this route is
// the code form and the toast provider, so it stays light for Lighthouse. Order on a phone: the title banner, the line
// "The audience writes the show.", the single yellow "Play a 2-minute demo" key, the 3-step strip (drawn on load: banners,
// doodles, yellow fat arrows), join with a code, host a show. The yellow stays on the thread: the swash on the headline,
// the one key, the numbered banners and arrows, the loop around the canon note.
import Link from "next/link";
import { StepDoodle } from "@/components/landing/StepDoodles";
import { Banner, NumberBanner } from "@/components/ui/Banner";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { tiltOf } from "@/components/ui/doodle";
import { FatArrow } from "@/components/ui/FatArrow";
import { Footer } from "@/components/ui/Footer";
import { InkUnderline } from "@/components/ui/InkUnderline";
import { JoinCodeForm } from "@/components/ui/JoinCodeForm";
import { PaperCard } from "@/components/ui/PaperCard";
import { StageBackdrop } from "@/components/ui/StageBackdrop";
import { Swash } from "@/components/ui/Swash";
import { COPY } from "@/lib/copy";

// The one-word names on the numbered banners (the longer step titles come from COPY below each drawing).
const STEP_TAGS = ["Type", "Vote", "Canon"] as const;
// When each step's pen starts (ms): banner, then its drawing, then the arrow to the next step.
const STEP_AT = [150, 1000, 1850] as const;

// Three paper notes fanned out, the front one with a yellow tick: the brand mark.
function LogoMark() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
      <rect x="4" y="7" width="14" height="19" rx="3" transform="rotate(-14 11 20)" fill="var(--paper-raised)" />
      <rect x="9" y="4" width="14" height="19" rx="3" transform="rotate(-2 16 14)" fill="var(--paper-raised)" />
      <rect x="14" y="6" width="14" height="19" rx="3" transform="rotate(10 21 16)" fill="var(--paper-raised)" />
      <path d="M18 14.5h7M18.5 19h5" stroke="var(--hl-deep)" strokeWidth="3" />
    </svg>
  );
}

export default function Landing() {
  const { landing } = COPY;
  const at = landing.title.indexOf("writes");
  const lead = at > 0 ? landing.title.slice(0, at) : "";
  const marked = at > 0 ? landing.title.slice(at) : landing.title;
  return (
    <div className="flex min-h-dvh flex-col">
      <StageBackdrop />
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3 md:px-8">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 font-display text-lead">
          <LogoMark />
          {COPY.brand}
        </Link>
        <nav aria-label="Primary">
          <Link href="/how-it-works" className="scribble inline-flex min-h-11 items-center px-3 text-small text-ink-notes hover:text-ink">
            {COPY.nav.howItWorks}
          </Link>
        </nav>
      </header>

      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pt-4 pb-16 md:px-8 md:pt-10">
        <section aria-labelledby="hero-title" className="flex flex-col items-center text-center">
          <div aria-hidden="true" className="pb-2">
            <Banner size="xl" play className="[--b-px:30] sm:[--b-px:46]" seed="landing-title">
              {COPY.brand}
            </Banner>
          </div>
          <h1 id="hero-title" className="mt-7 max-w-3xl text-[clamp(2rem,9vw,3.5rem)] leading-[1.1]">
            {lead}
            <Swash play delayMs={520}>
              {marked}
            </Swash>
          </h1>
          <p className="mt-5 max-w-[34ch] text-lead text-ink-notes md:text-h3">{landing.sub}</p>
          <div className="mt-7 flex w-full flex-col items-center gap-3 sm:w-auto">
            <ButtonLink href="/try?go=1" size="lg" block className="sm:w-auto">
              {landing.try.label}
            </ButtonLink>
            <p className="max-w-[36ch] text-small text-ink-notes">{landing.try.hint}</p>
          </div>
        </section>

        <section aria-labelledby="steps-title" className="mt-16 md:mt-24">
          <h2 id="steps-title" className="text-center font-display text-h3">
            <InkUnderline delayMs={0} seed="landing-steps">
              {landing.stepsHeading}
            </InkUnderline>
          </h2>
          <ol className="mt-12 grid gap-y-[72px] md:grid-cols-3 md:gap-x-[84px] md:gap-y-0">
            {landing.steps.map((s, i) => (
              <li key={s.title} className="relative">
                <PaperCard
                  alt={i % 2 === 1}
                  tilt={tiltOf(`landing-step-${i}`, 1.2)}
                  className="flex h-full flex-col items-center gap-3 px-4 pt-9 pb-6 text-center"
                >
                  <NumberBanner
                    n={i + 1}
                    label={STEP_TAGS[i]}
                    play
                    delayMs={STEP_AT[i]}
                    className="absolute -top-[18px] left-1/2 -translate-x-1/2"
                  />
                  <StepDoodle step={i as 0 | 1 | 2} delayMs={STEP_AT[i] + 500} />
                  <h3 className="font-display text-lead">{s.title}</h3>
                  <p className="text-small text-ink-notes">{s.body}</p>
                </PaperCard>
                {i < landing.steps.length - 1 ? (
                  <>
                    <FatArrow direction="down" size={44} delayMs={STEP_AT[i] + 800} seed={`landing-arrow-${i}`} className="absolute -bottom-[62px] left-1/2 -translate-x-1/2 md:hidden" />
                    <FatArrow size={58} delayMs={STEP_AT[i] + 800} seed={`landing-arrow-${i}`} className="absolute top-1/2 -right-[72px] hidden -translate-y-1/2 md:block" />
                  </>
                ) : null}
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="join-title" className="mt-24 flex flex-col items-center md:mt-28">
          <Card as="div" className="w-full max-w-md p-5 text-center">
            <h2 id="join-title" className="font-display text-h3">
              {landing.join.heading}
            </h2>
            <p className="mt-1 mb-4 text-small text-ink-notes">{landing.join.hint}</p>
            <JoinCodeForm />
          </Card>
          <div className="mt-9 flex flex-col items-center gap-1 text-center">
            <Link href="/host" className="inline-flex min-h-11 items-center px-3 font-display text-lead text-ink">
              <InkUnderline delayMs={STEP_AT[2] + 1200} seed="landing-host">
                {landing.host.label}
              </InkUnderline>
            </Link>
            <p className="text-small text-ink-notes">{landing.host.hint}</p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
