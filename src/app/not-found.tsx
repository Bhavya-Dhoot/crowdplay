// 404: a wrong link or a mistyped code. Offers the join form so the visitor can recover on the spot.
import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { JoinCodeForm } from "@/components/ui/JoinCodeForm";
import { COPY } from "@/lib/copy";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  const s = COPY.states.notFound;
  return (
    <main id="main" className="stage-light mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-4 py-12">
      <div className="space-y-3">
        <Link href="/" className="inline-flex min-h-11 items-center font-display text-lg font-extrabold">
          {COPY.brand}
        </Link>
        <h1 className="font-display text-4xl leading-tight">{s.title}</h1>
        <p className="text-muted">{s.body}</p>
      </div>
      <Card className="space-y-3 p-4">
        <h2 className="font-display text-xl">{COPY.landing.join.heading}</h2>
        <JoinCodeForm />
      </Card>
      <ButtonLink href="/" variant="ghost" block>
        {s.action}
      </ButtonLink>
    </main>
  );
}
