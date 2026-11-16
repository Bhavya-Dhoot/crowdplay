"use client";
// Same behaviour as the kit's ConnectionBanner (1 s grace, amber "Reconnecting…", green "Back online"
// for 2 s) but the pill carries data-testid="connection-banner" so e2e can see it. Fixed to the top.
import { Check, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/components/ui/cn";
import { COPY } from "@/lib/copy";
import type { ConnectionStatus } from "@/lib/realtime/types";

const SHOW_AFTER_MS = 1000;
const ONLINE_MS = 2000;

type Kind = "hidden" | "reconnecting" | "online";

export function ConnectionPill({ status }: { status: ConnectionStatus }) {
  const [kind, setKind] = useState<Kind>("hidden");

  useEffect(() => {
    const t =
      status === "connected"
        ? setTimeout(() => setKind((k) => (k === "reconnecting" ? "online" : "hidden")), 0)
        : setTimeout(() => setKind("reconnecting"), SHOW_AFTER_MS);
    return () => clearTimeout(t);
  }, [status]);

  useEffect(() => {
    if (kind !== "online") return;
    const t = setTimeout(() => setKind("hidden"), ONLINE_MS);
    return () => clearTimeout(t);
  }, [kind]);

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex justify-center px-4 pt-[calc(8px+env(safe-area-inset-top,0px))]">
      {kind === "hidden" ? null : (
        <p
          data-testid="connection-banner"
          data-status={kind}
          className={cn(
            "toast inline-flex min-h-9 items-center gap-2 rounded-pill px-4 text-sm font-semibold text-ink shadow-lg shadow-black/40",
            kind === "reconnecting" ? "bg-warn" : "bg-ok",
          )}
        >
          {kind === "reconnecting" ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <Check aria-hidden="true" className="size-4" />
          )}
          {kind === "reconnecting" ? COPY.connection.reconnecting : COPY.connection.online}
        </p>
      )}
    </div>
  );
}
