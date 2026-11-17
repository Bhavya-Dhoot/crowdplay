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
        "press inline-flex min-h-11 items-center gap-2 rounded-pill border border-stage-line bg-stage-1 px-4 text-small font-medium text-muted-on-stage [--press-overlay:rgb(255_255_255/0.08)] hover:text-on-stage",
        className,
      )}
    >
      <Radio aria-hidden="true" className="size-4 text-light" />
      {COPY.nexconnBadge}
    </Link>
  );
}
