// Footer: How it works · Impact · GitHub (only when NEXT_PUBLIC_REPO_URL is set) · NexconnBadge.
// Server component: NEXT_PUBLIC_REPO_URL is read at build time.
import Link from "next/link";
import { COPY } from "@/lib/copy";
import { cn } from "./cn";
import { NexconnBadge } from "./NexconnBadge";

const LINK =
  "inline-flex min-h-11 items-center rounded-pill px-3 text-sm font-medium text-muted transition-colors hover:text-text motion-reduce:transition-none";

export function Footer({ className }: { className?: string }) {
  const repo = process.env.NEXT_PUBLIC_REPO_URL;
  return (
    <footer className={cn("border-t border-line", className)}>
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-3 px-4 py-6 md:flex-row md:items-center md:justify-between md:px-8">
        <nav aria-label="Footer" className="-ml-3 flex flex-wrap items-center">
          <Link href="/how-it-works" className={LINK}>
            {COPY.nav.howItWorks}
          </Link>
          <Link href="/impact" className={LINK}>
            {COPY.nav.impact}
          </Link>
          {repo ? (
            <a href={repo} target="_blank" rel="noopener noreferrer" className={LINK}>
              {COPY.nav.github}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : null}
        </nav>
        <NexconnBadge />
      </div>
    </footer>
  );
}
