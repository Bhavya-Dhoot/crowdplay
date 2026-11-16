"use client";
// ConnectionBanner: hidden while connected. After 1 s of not being connected it shows an amber
// "Reconnecting…"; when the connection returns it flips to a green "Back online" for 2 s, then
// goes away. The 1 s grace stops it flashing during the first connect. Fixed to the top, so it
// never pushes the page around.
//   <ConnectionBanner status={connection} />
import { Check, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { COPY } from "@/lib/copy";
import type { ConnectionStatus } from "@/lib/realtime/types";
import { cn } from "./cn";

const SHOW_AFTER_MS = 1000;
const ONLINE_MS = 2000;

type Kind = "hidden" | "reconnecting" | "online";

export function ConnectionBanner({ status }: { status: ConnectionStatus }) {
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
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex justify-center px-4 pt-[calc(8px+env(safe-area-inset-top,0px))]"
    >
      {kind === "hidden" ? null : (
        <p
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
