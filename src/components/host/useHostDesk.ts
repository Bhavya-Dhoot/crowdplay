"use client";
// useHostDesk(code, hostKey): everything the console needs besides useRoom().
//   feed       latest GET /host/feed (ideas, players, metrics, links), polled every 1 s (4 s once ENDED)
//   feedAt     local time the feed arrived, so "online" dots need no Date.now() during render
//   pushed     newest PublicState seen in a heartbeat or action reply (faster than the next poll)
//   forbidden  the server said BAD_HOST_KEY: show the "this host link is not valid" page
//   notFound   NOT_FOUND from the host routes
//   failing    the last feed request failed (network or server): show a calm banner, keep polling
//   busy       keys of actions in flight (disable + spinner, no double submits)
//   pending    optimistic values for toggles, mute/ban and idea deletes until the feed confirms
//   run(key, action, optimistic?)  POST /host through hostAction; resolves true on success. A short toast confirms
//                       what happened (actionToast), a friendly one explains a failure
// The heartbeat POST every second also lazy-advances the engine on serverless hosts, so it keeps
// running for as long as the console is open and the show is live.
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import type { HostActionInput, HostFeedRes } from "@/lib/api/contracts";
import { getHostFeed, hostAction } from "@/lib/client/api";
import type { PublicState } from "@/lib/realtime/types";
import { actionToast, hostErrorMessage, newerState } from "./consoleLogic";

const FEED_MS = 1000;
const FEED_ENDED_MS = 4000;
const BEAT_MS = 1000;
/** How long an optimistic value may outlive its request while the feed catches up. */
const OPTIMISTIC_MS = 2500;

export type Optimistic = { key: string; value: boolean };

export type HostDesk = {
  feed: HostFeedRes | null;
  feedAt: number;
  pushed: PublicState | null;
  forbidden: boolean;
  notFound: boolean;
  failing: boolean;
  busy: ReadonlySet<string>;
  pending: Readonly<Record<string, boolean>>;
  run(key: string, action: HostActionInput, optimistic?: Optimistic): Promise<boolean>;
};

export function useHostDesk(code: string, hostKey: string, live: boolean): HostDesk {
  const toast = useToast();
  const [feed, setFeed] = useState<HostFeedRes | null>(null);
  const [feedAt, setFeedAt] = useState(0);
  const [pushed, setPushed] = useState<PublicState | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [failing, setFailing] = useState(false);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const liveRef = useRef(live);
  const inflight = useRef(new Set<string>());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    liveRef.current = live;
  }, [live]);
  useEffect(() => {
    const all = timers.current;
    return () => all.forEach(clearTimeout);
  }, []);

  const noteError = useCallback((r: { code: string }) => {
    if (r.code === "BAD_HOST_KEY") setForbidden(true);
    else if (r.code === "NOT_FOUND" || r.code === "ROOM_NOT_FOUND") setNotFound(true);
  }, []);

  const acceptState = useCallback((s: PublicState) => setPushed((prev) => newerState(prev, s)), []);

  // ---- feed loop ----
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const started = Date.now();
      const r = await getHostFeed(code, hostKey);
      if (stopped) return;
      if (r.ok) {
        setFeed(r);
        setFeedAt(Date.now());
        setFailing(false);
        setForbidden(false);
      } else if (r.code === "BAD_HOST_KEY" || r.code === "NOT_FOUND" || r.code === "ROOM_NOT_FOUND") {
        noteError(r);
        return; // nothing to poll for
      } else setFailing(true);
      const gap = liveRef.current ? FEED_MS : FEED_ENDED_MS;
      timer = setTimeout(() => void tick(), Math.max(250, gap - (Date.now() - started)));
    };
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [code, hostKey, noteError]);

  // ---- heartbeat loop ----
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const beat = async () => {
      if (liveRef.current) {
        const r = await hostAction(code, hostKey, { action: "heartbeat" });
        if (stopped) return;
        if (r.ok) acceptState(r.state);
        else if (r.code === "BAD_HOST_KEY") return noteError(r);
      }
      timer = setTimeout(() => void beat(), BEAT_MS);
    };
    timer = setTimeout(() => void beat(), BEAT_MS / 2); // interleave with the feed poll
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [code, hostKey, acceptState, noteError]);

  const run = useCallback(
    async (key: string, action: HostActionInput, optimistic?: Optimistic): Promise<boolean> => {
      if (inflight.current.has(key)) return false;
      inflight.current.add(key);
      setBusy(new Set(inflight.current));
      if (optimistic) setPending((p) => ({ ...p, [optimistic.key]: optimistic.value }));

      const r = await hostAction(code, hostKey, action);

      inflight.current.delete(key);
      setBusy(new Set(inflight.current));
      const clear = () =>
        setPending((p) => {
          if (!optimistic || !(optimistic.key in p)) return p;
          const next = { ...p };
          delete next[optimistic.key];
          return next;
        });
      if (r.ok) {
        acceptState(r.state);
        const said = actionToast(action);
        if (said) toast.show({ ...said, kind: "success", durationMs: 2600 });
        if (optimistic) {
          const t = setTimeout(() => {
            timers.current.delete(t);
            clear();
          }, OPTIMISTIC_MS);
          timers.current.add(t);
        }
        return true;
      }
      clear();
      noteError(r);
      toast.show({ title: hostErrorMessage(r.code, r.message), kind: "error" });
      return false;
    },
    [code, hostKey, acceptState, noteError, toast],
  );

  return { feed, feedAt, pushed, forbidden, notFound, failing, busy, pending, run };
}
