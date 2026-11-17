// Header for the depth pages: the notes mark + name on the left, the two public pages on the right, on the dot-grid page
// like the landing header. Server component (the landing page keeps its own copy of the mark).
import Link from "next/link";
import { COPY } from "@/lib/copy";

const LINK = "scribble inline-flex min-h-11 items-center px-3 text-small text-ink-notes hover:text-ink";

// Three paper notes fanned out, the front one with a yellow tick: the brand mark.
function LogoMark() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
      <rect x="4" y="7" width="14" height="19" rx="3" transform="rotate(-14 11 20)" fill="var(--paper-raised)" />
      <rect x="9" y="4" width="14" height="19" rx="3" transform="rotate(-2 16 14)" fill="var(--paper-raised)" />
      <rect x="14" y="6" width="14" height="19" rx="3" transform="rotate(10 21 16)" fill="var(--paper-raised)" />
      <path d="M18 14.5h7M18.5 19h5" stroke="var(--hl-deep)" strokeWidth="3" />
    </svg>
  );
}

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
