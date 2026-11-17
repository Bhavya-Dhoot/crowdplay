// NexconnBadge: "Built on Nexconn Chat SDK" -> /how-it-works. Footer of landing, host and try.
import Link from "next/link";
import { Radio } from "lucide-react";
import { COPY } from "@/lib/copy";
import { cn } from "./cn";

export function NexconnBadge({ className }: { className?: string }) {
  return (
    <Link
      href="/how-it-works"
      className={cn(
        "press inline-flex min-h-11 items-center gap-2 rounded-pill border-2 border-ink bg-paper-raised px-4 text-small text-ink-notes shadow-[3px_4px_0_var(--marker-2)] hover:text-ink",
        className,
      )}
    >
      <Radio aria-hidden="true" className="size-4 text-ink" />
      {COPY.nexconnBadge}
    </Link>
  );
}
