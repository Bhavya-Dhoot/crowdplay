// What a judge sees after FINALE: the demo is honest about being a demo and points at the real product.
// `compact` is the phone version: a short bar under the finale, so the story, the canon makers and "your night"
// above it keep their room (the full card used to stack on top of them and push them off screen).
import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { PaperCard } from "@/components/ui/PaperCard";
import { TRY_COPY } from "./tryCopy";

export function EndCard({ showId, compact = false, className }: { showId: string | null; compact?: boolean; className?: string }) {
  const story = showId ? (
    <Link
      href={`/story/${showId}`}
      data-testid="try-story-link"
      className={cn(
        "min-h-11 items-center text-small font-semibold text-ink underline decoration-gel-c decoration-2 underline-offset-4",
        // On a phone the finale above already carries this link; a short screen may scroll it out of sight, so repeat it there.
        compact ? "hidden [@media(max-height:760px)]:inline-flex" : "inline-flex",
      )}
    >
      {TRY_COPY.end.story}
    </Link>
  ) : null;

  return (
    <PaperCard
      as="section"
      data-testid="try-endcard"
      aria-labelledby="try-end-title"
      edge="gold"
      className={cn(compact ? "mx-4 mb-2 rounded-card px-4 py-3" : "rounded-card p-5", className)}
    >
      <div className={cn("flex flex-wrap items-baseline gap-x-2", compact ? "text-small" : "")}>
        <h2 id="try-end-title" className={cn("font-display leading-tight font-extrabold text-ink", compact ? "text-lead" : "text-h3")}>
          {TRY_COPY.end.title}
        </h2>
        <p className="script text-ink-muted">{TRY_COPY.end.body}</p>
        {compact ? story : null}
      </div>
      <div className={cn("flex gap-2", compact ? "mt-2" : "mt-4")}>
        <ButtonLink href="/host" variant="primary" size="sm" className="grow whitespace-nowrap">
          {TRY_COPY.end.host}
        </ButtonLink>
        <ButtonLink href="/how-it-works" variant="secondary" size="sm" className="grow whitespace-nowrap bg-paper-2">
          {TRY_COPY.end.how}
        </ButtonLink>
        <ButtonLink href="/impact" variant="secondary" size="sm" className="grow whitespace-nowrap bg-paper-2">
          {TRY_COPY.end.impact}
        </ButtonLink>
      </div>
      {!compact && story ? <div className="mt-2">{story}</div> : null}
    </PaperCard>
  );
}
