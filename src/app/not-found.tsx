// 404: a wrong link or a mistyped code. Offers the join form so the visitor can recover on the spot.
// The Join button is the one yellow key here: a mistyped code is the usual way to land on this page.
import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { JoinCodeForm } from "@/components/ui/JoinCodeForm";
import { StageBackdrop } from "@/components/ui/StageBackdrop";
import { COPY } from "@/lib/copy";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  const s = COPY.states.notFound;
  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-4 py-12">
      <StageBackdrop />
      <div className="space-y-3">
        <Link href="/" className="inline-flex min-h-11 items-center font-display text-lead">
          {COPY.brand}
        </Link>
        <h1 className="font-display text-h1">{s.title}</h1>
        <p className="text-lead text-ink-notes">{s.body}</p>
      </div>
      <Card as="section" aria-labelledby="nf-join" className="space-y-3 p-5">
        <h2 id="nf-join" className="font-display text-h3">
          {COPY.landing.join.heading}
        </h2>
        <JoinCodeForm variant="primary" />
      </Card>
      <ButtonLink href="/" variant="ghost" block>
        {s.action}
      </ButtonLink>
    </main>
  );
}
