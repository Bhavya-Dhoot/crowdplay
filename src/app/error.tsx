"use client";
// Error boundary for every route: say what happened in plain words and offer the way out.
// `retry` re-fetches and re-renders the segment (Next 16). "Try again" is the one yellow key.
import { Button, ButtonLink } from "@/components/ui/Button";
import { StageBackdrop } from "@/components/ui/StageBackdrop";
import { COPY } from "@/lib/copy";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const s = COPY.states.error;
  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-12">
      <StageBackdrop />
      <div className="space-y-3">
        <h1 className="font-display text-h1">{s.title}</h1>
        <p className="text-lead text-ink-notes">{s.body}</p>
        {error.digest ? <p className="text-fine text-ink-notes">Reference: {error.digest}</p> : null}
      </div>
      <div className="flex flex-col gap-3">
        <Button size="lg" block onClick={() => retry()}>
          {s.action}
        </Button>
        <ButtonLink href="/" variant="ghost" block>
          {s.home}
        </ButtonLink>
      </div>
    </main>
  );
}
