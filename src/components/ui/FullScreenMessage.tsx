"use client";
// FullScreenMessage: a calm full-screen state ("Hang tight — we'll be right back", "Host paused
// the show", "That page wandered off"). With `onRetry` it tries again by itself every few seconds
// and also offers a "Try now" button.
//   <FullScreenMessage title={COPY.states.unreachable.title} body={COPY.states.unreachable.body}
//                      onRetry={refresh} />
//   icon       any node (a lucide icon, an emoji); default is a soft pulsing dot
//   retryEveryMs  default 4000; 0 turns auto-retry off (the button stays)
//   actions    extra buttons/links under the text
import { LoaderCircle } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { COPY } from "@/lib/copy";
import { Button } from "./Button";
import { m, MotionScope } from "./motion";
import { TRANSITION } from "./motionTokens";

type Props = {
  title: string;
  body?: string;
  icon?: ReactNode;
  onRetry?: () => void | Promise<unknown>;
  retryEveryMs?: number;
  actions?: ReactNode;
};

export function FullScreenMessage({ title, body, icon, onRetry, retryEveryMs = 4000, actions }: Props) {
  const [busy, setBusy] = useState(false);

  const retry = async () => {
    if (!onRetry) return;
    setBusy(true);
    try {
      await onRetry();
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!onRetry || retryEveryMs <= 0) return;
    const id = setInterval(() => {
      setBusy(true);
      Promise.resolve(onRetry()).finally(() => setBusy(false));
    }, retryEveryMs);
    return () => clearInterval(id);
  }, [onRetry, retryEveryMs]);

  return (
    <MotionScope>
      <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-stage-0/95 p-6" role="status" aria-live="polite">
        <m.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={TRANSITION.medium}
          className="flex max-w-sm flex-col items-center gap-4 text-center"
        >
          <div aria-hidden="true" className="grid size-16 place-items-center text-4xl">
            {icon ?? <span className="size-4 rounded-full bg-light ring-8 ring-light/20 motion-safe:animate-pulse" />}
          </div>
          <h1 className="font-display text-h1 leading-tight">{title}</h1>
          {body ? <p className="text-muted-on-stage">{body}</p> : null}
          {onRetry ? (
            <>
              <Button variant="secondary" onClick={() => void retry()} disabled={busy}>
                {busy ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" /> : null}
                {busy ? COPY.states.retrying : "Try now"}
              </Button>
            </>
          ) : null}
          {actions}
        </m.div>
      </div>
    </MotionScope>
  );
}
