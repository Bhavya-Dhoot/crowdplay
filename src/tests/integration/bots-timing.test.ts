// How long Judge Mode really takes, on the real engine with real timers (the ticker, the bot timers, the realtime mock and
// the mock LLM; no browser). A scripted judge types one idea 3 s into each storm and votes 3 s after the ballot appears,
// like a quick human. About two minutes of wall clock, so it only runs on request:
//   DEMO_TIMING=1 pnpm exec vitest run src/tests/integration/bots-timing.test.ts
// The printed timeline is where the "about 2 minutes" in the demo copy comes from (src/lib/copy.ts DEMO_MINUTES).
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { POST as tryRoute } from "@/app/api/try/route";
import { POST as voteRoute } from "@/app/api/rooms/[code]/vote/route";
import type { TryRes } from "@/lib/api/contracts";
import { schema, useTestDb, type Db } from "@/lib/db/client";
import { resetEngineSingletons, setEngineClock } from "@/lib/engine/advance";
import { buildPublicState } from "@/lib/engine/publish";
import { startTicker, stopTicker } from "@/lib/engine/ticker";
import { ingestIdea } from "@/lib/ingest/ideas";
import { getRoomByCode } from "@/lib/rooms";
import { ctx, makeUser, req, rt } from "./engine-harness";
import { resetBotState } from "./bots-harness";

vi.mock("@/lib/realtime/index", async () => (await import("./engine-harness")).realtimeModule());

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await useTestDb());
});
afterAll(async () => {
  stopTicker();
  resetEngineSingletons();
  await close();
});

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe.skipIf(!process.env.DEMO_TIMING)("Judge Mode timing (real timers)", () => {
  it("plays three rounds in about two minutes, and the judge's idea wins at least once", async () => {
    setEngineClock(null);
    resetBotState();
    resetEngineSingletons();
    rt.reset();
    const judge = await makeUser(db, "Timing Judge");
    const t0 = Date.now();
    const res = await tryRoute(req("/api/try", { method: "POST", user: judge }));
    const started = (await res.json()) as TryRes;
    expect(started.ok).toBe(true);
    const room = (await getRoomByCode(started.code))!;
    startTicker();

    const ideas = ["the vault is full of cheese", "we hire a pigeon as our getaway driver", "a trombone quartet storms the ceiling"];
    const timeline: { at: number; key: string }[] = [];
    const sent = new Set<number>();
    const voted = new Set<number>();
    const stormAt = new Map<number, number>();
    const voteAt = new Map<number, number>();
    const narrations: string[] = [];
    let key = "";
    for (;;) {
      const s = await buildPublicState(room.id);
      const now = Date.now() - t0;
      const k = `${s.phase}${s.roundNo || ""}`;
      if (k !== key) {
        key = k;
        timeline.push({ at: now, key: k });
        if (s.phase === "STORM") stormAt.set(s.roundNo, now);
        if (s.phase === "VOTE") voteAt.set(s.roundNo, now);
      }
      if (s.phase === "REVEAL" && s.outcome?.narration && narrations.length < s.roundNo) narrations.push(s.outcome.narration);
      if (s.phase === "STORM" && !sent.has(s.roundNo) && now - (stormAt.get(s.roundNo) ?? now) >= 3000) {
        sent.add(s.roundNo);
        await ingestIdea({ roomCode: room.code, userId: judge.id, roundNo: s.roundNo, text: ideas[s.roundNo - 1], clientMsgId: `t_${s.roundNo}`, source: "post" });
      }
      if (s.phase === "VOTE" && s.options && !voted.has(s.roundNo) && now - (voteAt.get(s.roundNo) ?? now) >= 3000) {
        voted.add(s.roundNo);
        const pick = s.options.find((o) => o.boosted) ?? s.options[0];
        const r = await voteRoute(req(`/api/rooms/${room.code}/vote`, { user: judge, body: { roundNo: s.roundNo, optionId: pick.id } }), ctx(room.code));
        expect(r.status).toBe(200);
      }
      if (s.phase === "FINALE") break;
      if (now > 200_000) throw new Error(`demo did not finish: ${timeline.map((t) => t.key).join(" ")}`);
      await sleep(100);
    }
    const total = timeline[timeline.length - 1].at;

    const rounds = await db.select().from(schema.rounds).where(eq(schema.rounds.showId, started.showId));
    const options = await db.select().from(schema.options);
    const wonBoosted = rounds.filter((r) => options.find((o) => o.id === r.winnerOptionId)?.boosted).length;
    const secs = (ms: number) => (ms / 1000).toFixed(1).padStart(5);
    console.log(["DEMO TIMELINE (s)", ...timeline.map((t) => `${secs(t.at)}  ${t.key}`), `TOTAL ${secs(total)} s`, `judge idea won ${wonBoosted} of 3 rounds`].join("\n"));
    console.log(`NARRATIONS\n${narrations.join("\n")}`);

    expect(total).toBeGreaterThan(75_000);
    expect(total).toBeLessThan(135_000);
    expect(wonBoosted).toBeGreaterThanOrEqual(1);
  }, 240_000);
});
