import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const destroyChannel = vi.fn(async () => {});
vi.mock("@/lib/realtime/index", () => ({ getRealtimeServer: () => ({ destroyChannel }) }));

import { schema, useTestDb, type Db } from "@/lib/db/client";
import { sweepEndedChannels } from "@/lib/engine/ticker";

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await useTestDb());
  await db.insert(schema.users).values({ id: "u_host", displayName: "Host" });
  for (const [id, phase, ageMs] of [
    ["r_old", "ENDED", 10 * 60_000],
    ["r_new", "ENDED", 10_000],
    ["r_live", "VOTE", 10 * 60_000],
  ] as const) {
    await db.insert(schema.rooms).values({ id, code: id.slice(2, 7).toUpperCase().padEnd(5, "X"), channelId: `cp_${id}`, title: "t", hostUserId: "u_host", hostKeyHash: "0".repeat(64) });
    await db.insert(schema.shows).values({ id: `s_${id}`, roomId: id, premise: "p", preset: "heist", roundsTotal: 3, stormMs: 1000, voteMs: 1000, promptMs: 1000, revealMs: 1000 });
    await db.insert(schema.engineState).values({ roomId: id, showId: `s_${id}`, phase, payload: {}, updatedAt: new Date(Date.now() - ageMs) });
  }
});
afterAll(() => close());

describe("sweepEndedChannels", () => {
  it("destroys only channels of rooms that ended past the grace period, once", async () => {
    expect(await sweepEndedChannels()).toBe(1);
    expect(destroyChannel).toHaveBeenCalledWith("cp_r_old");
    expect(await sweepEndedChannels()).toBe(0);
    expect(destroyChannel).toHaveBeenCalledTimes(1);
  });
});
