// Landing page (design-v2 "Per-surface direction"). A server component: the only client code on this route is the
// looping example round (RoundMiniature), the code form and the toast provider, so it stays light for Lighthouse.
// Order on a phone: hero line, the gold "Play a 2-minute demo" button, the live example round, join with a code,
// host a show. On a wide screen the example round sits beside the hero and the join panel under it.
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Footer } from "@/components/ui/Footer";
import { JoinCodeForm } from "@/components/ui/JoinCodeForm";
import { RoundMiniature } from "@/components/ui/RoundMiniature";
import { COPY } from "@/lib/copy";

// Three index cards fanned out, each with its option gel along the top edge.
function LogoMark() {
  const gels = ["var(--gel-a)", "var(--gel-b)", "var(--gel-c)"] as const;
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
      {gels.map((gel, i) => (
        <g key={gel} transform={`rotate(${-16 + i * 16} 15 26)`}>
          <rect x="8.5" y="3" width="13" height="18" rx="3" fill="var(--paper)" stroke="var(--stage-0)" strokeWidth="1.2" />
          <path d="M8.5 6a3 3 0 0 1 3-3h7a3 3 0 0 1 3 3v1.2h-13z" fill={gel} />
        </g>
      ))}
    </svg>
  );
}

export default function Landing() {
  const { landing } = COPY;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 md:px-8">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 font-display text-lead font-extrabold tracking-tight">
          <LogoMark />
          {COPY.brand}
        </Link>
        <nav aria-label="Primary">
          <Link
            href="/how-it-works"
            className="press inline-flex min-h-11 items-center rounded-pill px-3 text-small font-medium text-muted-on-stage [--press-overlay:rgb(255_255_255/0.08)] hover:text-on-stage"
          >
            {COPY.nav.howItWorks}
          </Link>
        </nav>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-16 md:px-8 lg:pt-10">
        <div className="landing-grid">
          <section aria-labelledby="hero-title" className="landing-hero">
            <h1 id="hero-title" className="hero-title">
              {landing.title}
            </h1>
            <p className="script mt-5 max-w-[34ch] text-lead text-on-stage md:text-h3">{landing.sub}</p>
            <div className="mt-6 flex flex-col gap-2 sm:max-w-xs">
              <ButtonLink href="/try?go=1" size="lg" block>
                {landing.try.label}
              </ButtonLink>
              <p className="text-fine text-muted-on-stage">{landing.try.hint}</p>
            </div>
          </section>

          <div className="landing-mini">
            <RoundMiniature />
          </div>

          <div className="landing-join flex flex-col gap-5">
            <Card as="section" aria-labelledby="join-title" className="p-5 sm:max-w-md">
              <h2 id="join-title" className="font-display text-h3">
                {landing.join.heading}
              </h2>
              <p className="mt-1 mb-4 text-small text-muted-on-stage">{landing.join.hint}</p>
              <JoinCodeForm />
            </Card>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <Link
                href="/host"
                className="press group -ml-3 inline-flex min-h-11 items-center gap-2 rounded-pill px-3 font-display text-lead font-bold text-on-stage [--press-overlay:rgb(255_255_255/0.08)]"
              >
                {landing.host.label}
                <ArrowRight aria-hidden="true" className="size-5 text-gold transition-transform duration-175 group-hover:translate-x-1 motion-reduce:transition-none" />
              </Link>
              <p className="text-small text-muted-on-stage">{landing.host.hint}</p>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
