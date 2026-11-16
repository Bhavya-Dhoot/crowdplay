// Header for the depth pages: logo + the two public pages. Server component (the landing page keeps its own).
import Link from "next/link";
import { COPY } from "@/lib/copy";

const LINK =
  "inline-flex min-h-11 items-center rounded-pill px-3 text-sm font-medium text-muted transition-colors hover:text-text motion-reduce:transition-none";

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="8" cy="9" r="5.5" fill="var(--opt-a)" />
      <circle cx="20" cy="9" r="5.5" fill="var(--opt-b)" />
      <circle cx="14" cy="20" r="5.5" fill="var(--opt-c)" />
    </svg>
  );
}

export function SiteHeader() {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 md:px-8">
      <Link href="/" className="inline-flex min-h-11 items-center gap-2 font-display text-xl font-extrabold tracking-tight">
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
