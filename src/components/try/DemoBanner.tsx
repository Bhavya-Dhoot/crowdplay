// The honesty banner of Judge Mode: a paper slip with the DEMO ribbon and the plain sentence. Always visible, on the
// intro and during the show (UX_SPEC §3.6). One line on a phone ("30 🤖 simulated players"), the full sentence from sm
// up. `children` are the icon buttons on the right (big screen, leave). The slip lines up with the page's content.
import type { ReactNode } from "react";
import { Ribbon } from "@/components/ui/Ribbon";
import { TRY_COPY } from "./tryCopy";

export function DemoBanner({ children }: { children?: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1380px] shrink-0 px-2 pt-1.5 pb-1 md:px-6 lg:px-8 lg:pt-4">
      <div data-testid="try-banner" role="note" className="flex min-h-12 items-center justify-between gap-1 rounded-element border-2 border-ink bg-paper-raised pr-1 text-fine shadow-slip sm:text-small">
        <p className="flex min-w-0 items-center">
          <Ribbon kind="demo" size="sm" className="mr-[1.3em] shrink-0" />
          <span className="min-w-0 truncate sm:hidden">{TRY_COPY.banner.short}</span>
          <span className="hidden min-w-0 truncate sm:inline">{TRY_COPY.banner.full}</span>
        </p>
        {children ? <div className="flex shrink-0 items-center">{children}</div> : null}
      </div>
    </div>
  );
}
