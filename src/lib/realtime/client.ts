// STUB (owner: W1-ingest/realtime agent). Browser-side transport factory (dynamic import per mode).
import type { RealtimeClient } from "./types";
export async function createRealtimeClient(_mode: "mock" | "nexconn"): Promise<RealtimeClient> {
  throw new Error("createRealtimeClient not implemented");
}
