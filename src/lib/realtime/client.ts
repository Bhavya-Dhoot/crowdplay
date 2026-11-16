// Browser-side transport factory. Each adapter is a dynamic import so a page only downloads the one it uses.
import type { RealtimeClient } from "./types";

export async function createRealtimeClient(mode: "mock" | "nexconn"): Promise<RealtimeClient> {
  if (mode === "mock") return (await import("./mock.client")).createMockClient();
  return (await import("./nexconn.client")).createNexconnClient();
}
