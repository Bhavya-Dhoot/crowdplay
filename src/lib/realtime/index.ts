// Server-side transport, picked by REALTIME_MODE. One instance per process, on globalThis.
import { env } from "../config";
import { MockRealtimeServer } from "./mock.server";
import { createNexconnServer } from "./nexconn.server";
import type { RealtimeServer } from "./types";

const g = globalThis as unknown as { __cpRealtime?: RealtimeServer };

export function getRealtimeServer(): RealtimeServer {
  const mode = env().REALTIME_MODE;
  if (g.__cpRealtime?.kind !== mode) {
    g.__cpRealtime = mode === "mock" ? new MockRealtimeServer() : createNexconnServer();
  }
  return g.__cpRealtime;
}

/** Tests: drop the cached instance so the next call re-reads REALTIME_MODE. */
export function resetRealtimeServer(): void {
  g.__cpRealtime = undefined;
}
