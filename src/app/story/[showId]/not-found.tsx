// Shown when a story link points at a show that does not exist (mistyped link, or a show that was never played).
import type { Metadata } from "next";
import { SiteHeader } from "@/components/depth/SiteHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Footer } from "@/components/ui/Footer";

export const metadata: Metadata = { title: "Story not found", robots: { index: false } };

export default function StoryNotFound() {
  return (
    <div className="stage-light flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-4 py-12 md:px-8">
        <h1 className="font-display text-4xl leading-tight md:text-5xl">We can&apos;t find that story</h1>
        <p className="max-w-[44ch] text-lg text-muted">
          The link might be mistyped, or that show was never played. Ask whoever shared it to send the link again, or start a story of your own.
        </p>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/host">Host a show</ButtonLink>
          <ButtonLink href="/" variant="secondary">
            Back to the start
          </ButtonLink>
        </div>
      </main>
      <Footer />
    </div>
  );
}
