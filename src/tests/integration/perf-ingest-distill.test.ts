// F5 as a regression guard (scripts/load-sim.ts is the full 30 s run): 300 senders hit the HTTP ingestion route at once,
// the round holds 300 x 5 ideas, and the real engine distills it. Every attempt must be accepted or rejected with a reason,
// and STORM end -> options saved must stay inside the 8 s budget (mock AI; the real clusterer, validators and persistence).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { POST as ideasRoute } from "@/app/api/rooms/[code]/ideas/route";
import { cannedIdeas } from "@/lib/bots/canned";
import { schema, useTestDb, type Db } from "@/lib/db/client";
import { advance, resetEngineSingletons, setEngineClock, settleEffects } from "@/lib/engine/advance";
import { newId, newUserId } from "@/lib/ids";
import { resetRateLimits } from "@/lib/ingest/ratelimit";
import { createRoom, joinRoom } from "@/lib/rooms";
import { signSession } from "@/lib/auth/session";
import { call, rt } from "./engine-harness";
import { getState, installClock, tickToDeadline } from "./engine-flow";

vi.mock("@/lib/realtime/index", async () => (await import("./engine-harness")).realtimeModule());

const SENDERS = 300;
const IDEAS_EACH = 5;
const DISTILL_BUDGET_MS = 8000;

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await useTestDb());
});
afterAll(async () => {
  resetEngineSingletons();
  setEngineClock(null);
  await close();
});
beforeEach(() => {
  resetEngineSingletons();
  rt.reset();
  resetRateLimits();
  installClock();
});

describe("F5: 300 senders x 5 ideas, then distill", () => {
  it("drops nothing on the HTTP path and options are saved inside the 8 s budget", async () => {
    const host = { id: newUserId(), displayName: "Load Host", isBot: false };
    const users = Array.from({ length: SENDERS }, (_, i) => ({ id: newUserId(), displayName: `Sender ${String(i + 1).padStart(4, "0")}`, isBot: false }));
    await db.insert(schema.users).values([host, ...users]);
    const tokens = await Promise.all(users.map((u) => signSession(u.id)));
    const { room, show } = await createRoom(
      { title: "Load Test", preset: "heist", premise: "A heist crew with a thousand ideas.", roundsTotal: 3, stormMs: 30_000, voteMs: 5000, autoAdvance: true, strictFilter: true },
      host,
    );
    for (const u of users) await joinRoom(room, u);
    await advance(room.id, { type: "HOST_START" });
    await tickToDeadline(room.id); // PROMPT -> STORM
    expect((await getState({ code: room.code })).phase).toBe("STORM");

    const [r1] = await db.select({ id: schema.rounds.id }).from(schema.rounds).where(and(eq(schema.rounds.showId, show.id), eq(schema.rounds.roundNo, 1)));

    // Canned heist lines (45/35/20 mix) plus one-off sentences, so the ballot has a long tail to sift.
    const pool = cannedIdeas("heist");
    const text = (sender: number, wave: number) =>
      (sender + wave) % 5 === 0 ? `borrow gadget ${sender * 31 + wave} from room ${wave * 7 + (sender % 13)} and hide it` : pool[(sender * 7 + wave * 53) % pool.length];

    // Ideas 1-4 of every sender are stored as rows, the way ingestion would have stored them (pushing 1500 requests through
    // PGlite one at a time takes over 20 s; scripts/load-sim.ts does that for real). Idea 0 of all 300 senders hits the route at once.
    let ok = SENDERS * (IDEAS_EACH - 1);
    for (let wave = 1; wave < IDEAS_EACH; wave++) {
      await db.insert(schema.ideas).values(
        users.map((u, s) => ({ id: newId("i"), roundId: r1.id, userId: u.id, text: text(s, wave), clientMsgId: `bulk-${s}-${wave}-xxxx`, source: "post", status: "ok" })),
      );
    }
    resetRateLimits();
    const results = await Promise.all(
      users.map(async (_, s) => {
        try {
          const res = await call<{ ok: boolean; code?: string }>(
            ideasRoute,
            new Request("http://localhost/x", {
              method: "POST",
              headers: { cookie: `cp_session=${tokens[s]}`, "content-type": "application/json", "x-forwarded-for": `10.0.${Math.floor(s / 250)}.${(s % 250) + 1}` },
              body: JSON.stringify({ roundNo: 1, text: text(s, 0), clientMsgId: `cm-${s}-0-xxxxxxxx` }),
            }),
            room.code,
          );
          return res.status < 500 && typeof res.body.ok === "boolean" ? res.body : null;
        } catch {
          return null;
        }
      }),
    );
    const rejected: Record<string, number> = {};
    let dropped = 0;
    for (const r of results) {
      if (!r) dropped++;
      else if (r.ok) ok++;
      else rejected[r.code ?? "?"] = (rejected[r.code ?? "?"] ?? 0) + 1;
    }
    expect(dropped).toBe(0);
    expect(rejected).toEqual({});
    expect(ok).toBe(SENDERS * IDEAS_EACH);
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.ideas)
      .innerJoin(schema.rounds, eq(schema.rounds.id, schema.ideas.roundId))
      .where(and(eq(schema.rounds.showId, show.id), eq(schema.ideas.status, "ok")));
    expect(n).toBe(SENDERS * IDEAS_EACH);

    const saved = async () =>
      ((await db.select({ n: sql<number>`count(*)::int` }).from(schema.options).where(eq(schema.options.roundId, r1.id)))[0]?.n ?? 0) > 0;
    const t0 = Date.now();
    await tickToDeadline(room.id); // STORM -> DISTILL: the real RUN_DISTILL effect
    while (!(await saved())) {
      if (Date.now() - t0 > 30_000) throw new Error("options were never saved");
      await new Promise((r) => setTimeout(r, 10));
    }
    const ms = Date.now() - t0; // STORM end -> options saved
    await settleEffects();

    const state = await getState({ code: room.code });
    expect(state.phase).toBe("VOTE");
    expect(state.options?.map((o) => o.kind)).toEqual(["crowd", "crowd", "wildcard"]);
    const [round] = await db.select().from(schema.rounds).where(and(eq(schema.rounds.showId, show.id), eq(schema.rounds.roundNo, 1)));
    expect(round).toMatchObject({ ideasCount: SENDERS * IDEAS_EACH, fallbackUsed: false });
    expect(ms).toBeLessThan(DISTILL_BUDGET_MS);
  }, 120_000);
});
