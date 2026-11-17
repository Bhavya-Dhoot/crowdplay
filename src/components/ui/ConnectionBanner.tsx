"use client";
// ConnectionBanner: hidden while connected. After 1 s of not being connected it shows an ink spinner and
// "Reconnecting…"; when the connection returns it flips to a drawn check and "Back online" for 2 s, then
// goes away. The 1 s grace stops it flashing during the first connect. Fixed to the top, so it
// never pushes the page around. A paper slip with washi tape; the status is the icon plus the words.
//   <ConnectionBanner status={connection} />
import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { COPY } from "@/lib/copy";
import type { ConnectionStatus } from "@/lib/realtime/types";
import { PenCheck } from "./PenCheck";

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
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex justify-center px-4 pt-[calc(14px+env(safe-area-inset-top,0px))]"
    >
      {kind === "hidden" ? null : (
        <p className="toast slip inline-flex min-h-9 items-center gap-2 rounded-pill px-4 text-small text-ink">
          {kind === "reconnecting" ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : <PenCheck size={16} />}
          {kind === "reconnecting" ? COPY.connection.reconnecting : COPY.connection.online}
        </p>
      )}
    </div>
  );
}
