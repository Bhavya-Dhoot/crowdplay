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
        "inline-flex min-h-11 items-center gap-2 rounded-pill border border-line bg-surface px-4 text-sm font-medium text-muted transition-colors hover:border-accent hover:text-text motion-reduce:transition-none",
        className,
      )}
    >
      <Radio aria-hidden="true" className="size-4 text-accent" />
      {COPY.nexconnBadge}
    </Link>
  );
}
