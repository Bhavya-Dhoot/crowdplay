// The honesty banner of Judge Mode. Always visible, on the intro and during the show (UX_SPEC §3.6).
import type { ReactNode } from "react";
import { COPY } from "@/lib/copy";

export function DemoBanner({ children }: { children?: ReactNode }) {
  return (
    <div
      data-testid="try-banner"
      role="note"
      className="flex min-h-11 shrink-0 items-center justify-between gap-3 border-b border-wild/40 bg-wild/10 px-4 py-1.5 text-[13px] leading-snug font-medium text-text md:px-6 md:text-sm"
    >
      <p>{COPY.try.banner}</p>
      {children}
    </div>
  );
}
