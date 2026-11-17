// The honesty banner of Judge Mode. Always visible, on the intro and during the show (UX_SPEC §3.6).
// One line on a phone ("Demo room · 30 🤖 simulated players"), the full sentence from sm up. `children` are the
// icon buttons on the right (big screen, leave).
import type { ReactNode } from "react";
import { COPY } from "@/lib/copy";

export function DemoBanner({ children }: { children?: ReactNode }) {
  return (
    <div
      data-testid="try-banner"
      role="note"
      className="flex min-h-11 shrink-0 items-center justify-between gap-2 border-b border-stage-line bg-stage-1 px-4 text-fine leading-snug font-medium text-on-stage sm:text-small md:px-6"
    >
      <p className="min-w-0 truncate">
        <span className="sm:hidden">{COPY.try.bannerShort}</span>
        <span className="hidden sm:inline">{COPY.try.banner}</span>
      </p>
      {children ? <div className="-mr-2 flex shrink-0 items-center">{children}</div> : null}
    </div>
  );
}
