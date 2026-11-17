// Header for the depth pages: the notes mark + name on the left, the two public pages on the right, on the dot-grid page
// like the landing header. Server component (the landing page keeps its own copy of the mark).
import Link from "next/link";
import { COPY } from "@/lib/copy";
import { LogoMark } from "@/components/ui/LogoMark";

const LINK = "scribble inline-flex min-h-11 items-center px-3 text-small text-ink-notes hover:text-ink";

export function SiteHeader() {
  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3 md:px-8">
      <Link href="/" className="inline-flex min-h-11 items-center gap-2 font-display text-lead">
        <LogoMark />
        {COPY.brand}
      </Link>
      <nav aria-label="Primary" className="-mr-3 flex items-center">
        <Link href="/how-it-works" className={LINK}>
          {COPY.nav.howItWorks}
        </Link>
        <Link href="/impact" className={LINK}>
          {COPY.nav.impact}
        </Link>
      </nav>
    </header>
  );
}
