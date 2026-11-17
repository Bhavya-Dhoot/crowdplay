// Shown when a story link points at a show that does not exist (mistyped link, or a show that was never played).
import type { Metadata } from "next";
import { SiteHeader } from "@/components/depth/SiteHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Footer } from "@/components/ui/Footer";
import { StageBackdrop } from "@/components/ui/StageBackdrop";
import { COPY } from "@/lib/copy";

export const metadata: Metadata = { title: "Story not found", robots: { index: false } };

export default function StoryNotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <StageBackdrop roundNo={1} />
      <SiteHeader />
      <main id="main" className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-10 md:px-8">
        <div className="paper dp-sheet px-6 py-10 md:px-10">
          <h1 className="font-display text-h1 leading-tight font-extrabold text-balance text-ink md:text-[2.75rem]">We can&apos;t find that story</h1>
          <p className="script mt-4 max-w-[44ch] text-body leading-[1.7] text-ink-muted">
            The link might be mistyped, or that show was never played. Ask whoever shared it to send the link again, or start a story of your own.
          </p>
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
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
