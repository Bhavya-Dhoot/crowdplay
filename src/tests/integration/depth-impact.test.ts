import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as impactGet } from "@/app/api/impact/route";
import type { ImpactRes } from "@/lib/api/contracts";
import { useTestDb, type Db } from "@/lib/db/client";
import { getImpact, resetMetricsCache } from "@/lib/metrics";
import { idea, playedRound, receipt, round, show, user, vote, type Fx } from "./depth-fixtures";

let db: Db;
let close: () => Promise<void>;
const DAY = 86_400_000;

beforeAll(async () => {
  ({ db, close } = await useTestDb());
});
afterAll(() => close());
beforeEach(() => resetMetricsCache());

describe("impact with no usage at all", () => {
  it("reports zeros and nulls, never invented numbers", async () => {
    const res = await getImpact();
    expect(res.totals).toEqual({
      realPeople: 0,
      showsCompleted: 0,
      ideas: 0,
      canonMakers: 0,
      medianDistillMs: null,
      p95DistillMs: null,
      fallbackRate: null,
    });
    expect(res.sessions).toEqual([]);
  });
});

describe("impact counts real usage only", () => {
  let r2: Fx;
  let r2RoundId: string;

  beforeAll(async () => {
    const alice = await user(db, "Alice");
    const bea = await user(db, "Bea");
    const cy = await user(db, "Cy");
    const vic = await user(db, "Vic"); // votes, never types
    const deb = await user(db, "Former player", { deleted: true }); // deleted data
    const ghost = await user(db, "Ghost", { deleted: true }); // deleted, only voted
    const bot = await user(db, "Captain Noodle", { bot: true });
    const judge = await user(db, "Judge"); // human, but only in a demo room

    // R1: a real show that finished, two decided rounds plus one that never started.
    const r1 = await show(db, { title: "Real show one", status: "ended", startedAt: new Date(Date.now() - 2 * DAY) });
    const p1 = await playedRound(db, r1, 1, { winnerUsers: [alice, bea], distillMs: 1000 });
    await idea(db, p1.roundId, alice, "alice second idea");
    await idea(db, p1.roundId, bea, "blocked idea", "blocked");
    await idea(db, p1.roundId, deb, "idea of a deleted user");
    await idea(db, p1.roundId, bot, "a bot idea in a real room");
    await vote(db, p1.roundId, vic, p1.winnerId);
    await vote(db, p1.roundId, alice, p1.winnerId);
    await vote(db, p1.roundId, ghost, p1.winnerId);
    await receipt(db, { userId: alice, showId: r1.showId, roundId: p1.roundId, optionId: p1.winnerId, ideaId: p1.ideaIds[0] });
    await receipt(db, { userId: bot, showId: r1.showId, roundId: p1.roundId, optionId: p1.winnerId, ideaId: p1.ideaIds[0] });
    await receipt(db, { userId: deb, showId: r1.showId, roundId: p1.roundId, optionId: p1.winnerId, ideaId: p1.ideaIds[0] });
    await playedRound(db, r1, 2, { winnerUsers: [alice], distillMs: 3000, fallback: true });
    await round(db, r1.showId, 3, { status: "pending", ideasCount: 0, distillMs: 50 }); // empty round: not timed

    // R2: still live, one real person, one timed round that was not revealed.
    r2 = await show(db, { title: "Live show two", status: "live", startedAt: new Date(Date.now() - DAY) });
    r2RoundId = await round(db, r2.showId, 1, { status: "storm", ideasCount: 1, distillMs: 8000 });
    await idea(db, r2RoundId, cy, "cy idea");

    // R3: finished, one decided round, nobody in it: not a completed show.
    const r3 = await show(db, { title: "Nobody came", status: "ended" });
    await playedRound(db, r3, 1, { winnerUsers: [], winnerKind: "narrator", distillMs: 4 });

    // Demo room: a human judge, bots, huge numbers. None of it may leak into /impact.
    const demo = await show(db, { title: "Demo room", demo: true, status: "ended" });
    const pd = await playedRound(db, demo, 1, { winnerUsers: [judge, bot], distillMs: 99_999 });
    await vote(db, pd.roundId, judge, pd.winnerId);
    await receipt(db, { userId: judge, showId: demo.showId, roundId: pd.roundId, optionId: pd.winnerId, ideaId: pd.ideaIds[0] });
  });

  it("excludes bots, deleted users and demo rooms from every total", async () => {
    const { totals } = await getImpact();
    expect(totals.realPeople).toBe(4); // alice, bea, cy, vic
    expect(totals.ideas).toBe(5); // show one: 3 in round 1 + 1 in round 2; show two: 1. Blocked, deleted-user, bot and demo ideas are out
    expect(totals.showsCompleted).toBe(1); // only "Real show one"
    expect(totals.canonMakers).toBe(1); // alice; the bot, the deleted user and the demo judge do not count
  });

  it("computes distill stats over timed rounds that had ideas, in real rooms only", async () => {
    const { totals } = await getImpact();
    // 1000 (ok), 3000 (fallback), 8000 (ok). Excluded: 50 ms empty round, 4 ms nobody-came round, 99 999 ms demo round.
    expect(totals.medianDistillMs).toBe(3000);
    expect(totals.p95DistillMs).toBe(8000);
    expect(totals.fallbackRate).toBeCloseTo(1 / 3, 3);
  });

  it("lists real sessions newest first with per-session people, ideas and decided rounds", async () => {
    const { sessions } = await getImpact();
    expect(sessions.map((s) => s.title)).toEqual(["Live show two", "Real show one"]);
    const [live, done] = sessions;
    expect(live).toMatchObject({ people: 1, ideas: 1, rounds: 0 });
    expect(done).toMatchObject({ people: 3, ideas: 4, rounds: 2 }); // alice, bea, vic; 3 + 1 ideas
    expect(sessions.some((s) => s.title === "Demo room" || s.title === "Nobody came")).toBe(false);
    expect(done.date).toBeLessThan(live.date);
    expect(done.showId).toMatch(/^sh_/);
  });

  it("serves the ImpactRes shape from the route, with a short shared cache header", async () => {
    const res = await impactGet();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("s-maxage=60");
    const body = (await res.json()) as ImpactRes;
    expect(body.ok).toBe(true);
    expect(Object.keys(body.totals).sort()).toEqual(
      ["canonMakers", "fallbackRate", "ideas", "medianDistillMs", "p95DistillMs", "realPeople", "showsCompleted"].sort(),
    );
    expect(typeof body.generatedAt).toBe("number");
    for (const s of body.sessions) expect(Object.keys(s).sort()).toEqual(["date", "ideas", "people", "rounds", "showId", "title"]);
  });

  it("caches for 60 seconds, then reads the database again", async () => {
    const t0 = 5_000_000_000_000;
    const first = await getImpact(t0);
    const dan = await user(db, "Dan");
    await idea(db, r2RoundId, dan, "a new real idea"); // lands in a real room after the first read

    const cached = await getImpact(t0 + 59_000);
    expect(cached).toBe(first); // the very same object: nothing was recomputed
    expect(cached.totals.realPeople).toBe(4);

    const fresh = await getImpact(t0 + 60_001);
    expect(fresh.generatedAt).toBe(t0 + 60_001);
    expect(fresh.totals.realPeople).toBe(5);
    expect(fresh.totals.ideas).toBe(6);
  });
});
