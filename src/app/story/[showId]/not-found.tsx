// Shown when a story link points at a show that does not exist (mistyped link, or a show that was never played).
// A note with a dashed outline (nothing is written here) and a drawn question mark; the one yellow key starts a story.
import type { Metadata } from "next";
import { SiteHeader } from "@/components/depth/SiteHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Footer } from "@/components/ui/Footer";
import { InkUnderline } from "@/components/ui/InkUnderline";
import { PaperCard } from "@/components/ui/PaperCard";
import { StageBackdrop } from "@/components/ui/StageBackdrop";
import { COPY } from "@/lib/copy";

export const metadata: Metadata = { title: "Story not found", robots: { index: false } };

export default function StoryNotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <StageBackdrop />
      <SiteHeader />
      <main id="main" className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-10 md:px-8">
        <PaperCard edge="wild" tilt={-0.8} className="flex flex-col items-start gap-5 px-6 py-9 sm:flex-row sm:items-center md:px-9">
          <span aria-hidden="true" className="grid size-20 shrink-0 place-items-center rounded-blob border-2 border-dashed border-ink font-display text-[3rem] leading-none">
            ?
          </span>
          <div>
            <h1 className="text-h1 leading-tight text-balance">
              <InkUnderline seed="story-missing">We can&apos;t find that story</InkUnderline>
            </h1>
            <p className="mt-4 max-w-[44ch] text-body leading-relaxed text-ink-notes">
              The link might be mistyped, or that show was never played. Ask whoever shared it to send the link again, or start a story of your own.
            </p>
          </div>
        </PaperCard>
        <div className="mt-9 flex flex-wrap gap-3">
          <ButtonLink href="/host">{COPY.landing.host.label}</ButtonLink>
          <ButtonLink href="/" variant="secondary">
            Back to the start
          </ButtonLink>
        </div>
      </main>
      <Footer />
    </div>
  );
}
