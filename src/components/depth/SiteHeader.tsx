// Header for the depth pages: logo + the two public pages. Server component (the landing page keeps its own).
import Link from "next/link";
import { COPY } from "@/lib/copy";

const LINK =
  "press inline-flex min-h-11 items-center rounded-pill px-3 text-small font-medium text-muted-on-stage [--press-overlay:rgb(255_255_255/0.08)] hover:text-on-stage";

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="8" cy="9" r="5.5" fill="var(--gel-a)" />
      <circle cx="20" cy="9" r="5.5" fill="var(--gel-b)" />
      <circle cx="14" cy="20" r="5.5" fill="var(--gel-c)" />
    </svg>
  );
}

export function SiteHeader() {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 md:px-8">
      <Link href="/" className="inline-flex min-h-11 items-center gap-2 font-display text-lead font-extrabold tracking-tight text-on-stage">
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
