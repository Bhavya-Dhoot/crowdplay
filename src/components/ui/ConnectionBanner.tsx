"use client";
// ConnectionBanner: hidden while connected. After 1 s of not being connected it shows an amber
// "Reconnecting…"; when the connection returns it flips to a green "Back online" for 2 s, then
// goes away. The 1 s grace stops it flashing during the first connect. Fixed to the top, so it
// never pushes the page around. A glass pill (opaque under reduced transparency / high contrast);
// the status is the icon plus the words, the colour only supports them.
//   <ConnectionBanner status={connection} />
import { Check, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { COPY } from "@/lib/copy";
import type { ConnectionStatus } from "@/lib/realtime/types";
import { cn } from "./cn";

const SHOW_AFTER_MS = 1000;
// The very first connect gets a longer grace: a slow cold start is not a "reconnect".
const FIRST_CONNECT_GRACE_MS = 4000;
const ONLINE_MS = 2000;

type Kind = "hidden" | "reconnecting" | "online";

export function ConnectionBanner({ status }: { status: ConnectionStatus }) {
  const [kind, setKind] = useState<Kind>("hidden");
  const everConnected = useRef(false);

  useEffect(() => {
    if (status === "connected") everConnected.current = true;
    const t =
      status === "connected"
        ? setTimeout(() => setKind((k) => (k === "reconnecting" ? "online" : "hidden")), 0)
        : setTimeout(() => setKind("reconnecting"), everConnected.current ? SHOW_AFTER_MS : FIRST_CONNECT_GRACE_MS);
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
      className="toast-region pointer-events-none fixed inset-x-0 top-0 z-[70] flex justify-center px-4 pt-[calc(8px+env(safe-area-inset-top,0px))]"
      data-placement="top"
    >
      {kind === "hidden" ? null : (
        <p
          className={cn(
            "toast glass inline-flex min-h-9 items-center gap-2 rounded-pill px-4 text-small font-semibold text-on-stage",
            "shadow-[0_6px_16px_-10px_rgb(0_0_0/0.7)]",
          )}
        >
          {kind === "reconnecting" ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-warn motion-reduce:animate-none" />
          ) : (
            <Check aria-hidden="true" className="size-4 text-ok" />
          )}
          {kind === "reconnecting" ? COPY.connection.reconnecting : COPY.connection.online}
        </p>
      )}
    </div>
  );
}
