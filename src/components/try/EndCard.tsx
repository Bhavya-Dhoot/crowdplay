// What a judge sees after FINALE: the demo is honest about being a demo and points at the real product. A small
// poster: the title on a banner with the number swashed, one line of narration, and paper keys only, because the
// finale on the phone panel already carries the page's one yellow key (Share story) on every screen size.
// `compact` is the phone version: a short bar under the finale, so the story, the canon makers and "your night"
// above it keep their room.
import { Banner } from "@/components/ui/Banner";
import { ButtonLink } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { PaperCard } from "@/components/ui/PaperCard";
import { Swash } from "@/components/ui/Swash";
import { Tape } from "./Tape";
import { TRY_COPY } from "./tryCopy";

export function EndCard({ showId, compact = false, className }: { showId: string | null; compact?: boolean; className?: string }) {
  const { end } = TRY_COPY;
  // The phone's keys are a hair narrower (the three of them share one row at 360 px); `!` beats the size class's padding.
  const keyClass = cn("whitespace-nowrap", compact && "px-2.5! text-fine!");
  const keys = (
    <>
      <ButtonLink href="/host" variant="secondary" size="sm" className={keyClass}>
        {end.host}
      </ButtonLink>
      <ButtonLink href="/how-it-works" variant="secondary" size="sm" className={keyClass}>
        {end.how}
      </ButtonLink>
      <ButtonLink href="/impact" variant="secondary" size="sm" className={keyClass}>
        {end.impact}
      </ButtonLink>
    </>
  );

  if (compact) {
    return (
      <PaperCard as="section" data-testid="try-endcard" aria-labelledby="try-end-title" className={cn("mb-2 px-2.5 py-2.5 shadow-slip", className)}>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h2 id="try-end-title" className="text-lead leading-tight text-ink">
            {end.lead}
            <Swash>{end.marked}</Swash>
          </h2>
          <p className="text-small text-ink-notes [@media(max-height:760px)]:hidden">{end.body}</p>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-1.5 gap-y-1">
          {keys}
          {showId ? (
            // The finale above carries this link; a short screen may scroll it out of sight, so repeat it there.
            <ButtonLink
              href={`/story/${showId}`}
              data-testid="try-story-link"
              variant="ghost"
              size="sm"
              className="hidden whitespace-nowrap px-2.5! text-fine! [@media(max-height:760px)]:inline-flex"
            >
              {end.story}
            </ButtonLink>
          ) : null}
        </div>
      </PaperCard>
    );
  }

  return (
    <PaperCard
      as="section"
      data-testid="try-endcard"
      aria-labelledby="try-end-title"
      tilt={-0.5}
      className={cn("relative w-fit max-w-full px-6 pt-8 pb-6 shadow-poster", className)}
    >
      <Tape className="-top-3 right-10 rotate-[5deg]" />
      <h2 id="try-end-title" className="absolute -top-[22px] left-3">
        <Banner size="lg" play seed="try-end-title">
          {end.lead}
          <Swash>{end.marked}</Swash>
        </Banner>
      </h2>
      <p className="text-lead text-ink-notes">{end.body}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-3">
        {showId ? (
          <ButtonLink href={`/story/${showId}`} data-testid="try-story-link" variant="secondary" size="md" className="whitespace-nowrap">
            {end.story}
          </ButtonLink>
        ) : null}
        {keys}
      </div>
    </PaperCard>
  );
}
