import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { GET as feedRoute } from "@/app/api/rooms/[code]/host/feed/route";
import type { HostFeedRes } from "@/lib/api/contracts";
import { schema, useTestDb, type Db } from "@/lib/db/client";
import { resetEngineSingletons, setEngineClock, settleEffects } from "@/lib/engine/advance";
import { NARRATOR_USER_ID } from "@/lib/realtime/types";
import { addIdea, ai, call, clock, engineRow, roundRow, rt } from "./engine-harness";
import {
  getState,
  hostAct,
  installClock,
  newShow,
  receiptRows,
  tickToDeadline,
  vote,
  type Show,
} from "./engine-flow";

vi.mock("@/lib/realtime/index", async () => (await import("./engine-harness")).realtimeModule());
vi.mock("@/lib/ai/distill", async () => (await import("./engine-harness")).distillModule());
vi.mock("@/lib/ai/narrate", async () => (await import("./engine-harness")).narrateModule());
vi.mock("@/lib/ai/prompts", async () => (await import("./engine-harness")).promptsModule());
vi.mock("@/lib/ai/finale", async () => (await import("./engine-harness")).finaleModule());
vi.mock("@/lib/bots/runner", async () => (await import("./engine-harness")).botsModule());
vi.mock("@/lib/presets", async () => (await import("./engine-harness")).presetsModule());

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
  ai.reset();
  installClock();
});

/**
 * Seven clusters so the distiller has three live options and three backups:
 * Rob the vault x3 (A), Dig a tunnel x2 (B), then single ideas in arrival order (C and backups).
 */
async function richIdeas(s: Show, r: number) {
  const [a, b, c] = s.players;
  const t = clock.now;
  const rows: [typeof a, string][] = [
    [a, "Rob the vault"],
    [b, "Rob the vault"],
    [c, "Rob the vault"],
    [a, "Dig a tunnel"],
    [b, "Dig a tunnel"],
    [c, "Hire a pigeon"],
    [a, "Bribe the guard"],
    [b, "Cut the power"],
    [c, "Fake a fire drill"],
  ];
  for (const [i, [u, text]] of rows.entries()) await addIdea(db, s.showId, r, u.id, text, t + 1 + i);
}

async function toVote(s: Show) {
  await hostAct(s, { action: "start" });
  await tickToDeadline(s.roomId); // STORM
  await richIdeas(s, 1);
  await tickToDeadline(s.roomId); // DISTILL
  await settleEffects();
  const st = await getState(s);
  expect(st.phase).toBe("VOTE");
  return st;
}

async function liveLabels(s: Show) {
  return (await getState(s)).options!.map((o) => o.label);
}

describe("C2: host veto, re-roll, force-win", () => {
  it("veto replaces an option within 3 s with the next backup, then narrator options when backups run out", async () => {
    const s = await newShow({ autoAdvance: true });
    const [ava, ben, cleo] = s.players;
    const st = await toVote(s);
    const [A, , C] = st.options!;
    expect([A.label, C.label]).toEqual(["Rob the vault", "Hire a pigeon"]);
    await vote(s, ava, 1, A.id);
    await vote(s, ben, 1, C.id);
    await vote(s, cleo, 1, C.id);
    await settleEffects();
    const vBefore = (await engineRow(db, s.roomId)).version;

    const t0 = Date.now();
    const res = await hostAct(s, { action: "veto", optionId: C.id });
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(res.status).toBe(200);
    expect(res.body.state.phase).toBe("VOTE");
    const replaced = res.body.state.options!.find((o) => o.slot === "C")!;
    expect(replaced.label).toBe("Bribe the guard"); // first stored backup
    expect(replaced.id).not.toBe(C.id);
    expect(replaced.credit.map((c) => c.name)).toEqual(["Ava"]);
    expect(res.body.state.v).toBe(vBefore + 1);
    expect(res.body.state.tally).toEqual({ [A.id]: 1, [res.body.state.options![1].id]: 0, [replaced.id]: 0 }); // the vetoed option's votes are gone
    expect(res.body.state.votesTotal).toBe(1);
    const [vetoed] = await db.select().from(schema.options).where(eq(schema.options.id, C.id));
    expect(vetoed).toMatchObject({ vetoed: true, slot: null });
    await settleEffects();
    expect((await receiptRows(s, 1, "BALLOT")).some((r) => r.userId === ava.id && r.optionId === replaced.id)).toBe(true);

    // Vetoing again walks down the backups (rank 5, 6), then falls back to a narrator option.
    let current = replaced;
    for (const expected of ["Cut the power", "Fake a fire drill"]) {
      const r = await hostAct(s, { action: "veto", optionId: current.id });
      current = r.body.state.options!.find((o) => o.slot === "C")!;
      expect(current.label).toBe(expected);
    }
    const last = await hostAct(s, { action: "veto", optionId: current.id });
    const narrator = last.body.state.options!.find((o) => o.slot === "C")!;
    expect(narrator).toMatchObject({ kind: "narrator", label: "heist: act", supporters: 0, credit: [], more: 0 });
    expect(last.body.state.options).toHaveLength(3);
    expect(new Set(last.body.state.options!.map((o) => o.slot))).toEqual(new Set(["A", "B", "C"]));
  });

  it("veto rejects an option that is not on the ballot", async () => {
    const s = await newShow({ autoAdvance: true });
    await toVote(s);
    const r = await hostAct(s, { action: "veto", optionId: "nope" });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("BAD_OPTION");
  });

  it("re-roll works once per round, clears votes, excludes the old labels and rejects a second one", async () => {
    const s = await newShow({ autoAdvance: true });
    const [ava] = s.players;
    const st = await toVote(s);
    const oldLabels = st.options!.map((o) => o.label);
    await vote(s, ava, 1, st.options![0].id);
    await settleEffects();

    const rr = await hostAct(s, { action: "reroll" });
    expect(rr.status).toBe(200);
    expect(rr.body.state.phase).toBe("DISTILL");
    await settleEffects();
    const after = await getState(s);
    expect(after.phase).toBe("VOTE");
    expect(after.options!.map((o) => o.label)).toEqual(["Bribe the guard", "Cut the power", "Fake a fire drill"]);
    expect(after.options!.some((o) => oldLabels.includes(o.label))).toBe(false);
    expect(after.votesTotal).toBe(0);
    expect(ai.distillCalls.at(-1)?.excludeLabels).toEqual(oldLabels);
    expect((await receiptRows(s, 1, "BALLOT")).some((r) => r.optionId === after.options![0].id)).toBe(true);

    const second = await hostAct(s, { action: "reroll" });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("REROLL_USED");
    expect((await getState(s)).phase).toBe("VOTE");
    expect(await liveLabels(s)).toEqual(["Bribe the guard", "Cut the power", "Fake a fire drill"]);

    const feed = await call<HostFeedRes>(feedRoute, new Request("http://localhost/x", { headers: { "x-host-key": s.hostKey } }), s.code);
    expect(feed.body.metrics.rerollUsed).toBe(true);

    // The allowance resets with the next round.
    await tickToDeadline(s.roomId); // VOTE -> REVEAL
    await settleEffects();
    await tickToDeadline(s.roomId); // REVEAL -> PROMPT 2
    expect((await engineRow(db, s.roomId)).payload).toMatchObject({ rerollUsed: false });
  });

  it("force-win beats the tally and credits the forced option's contributors", async () => {
    const s = await newShow({ autoAdvance: true });
    const [ava, ben, cleo] = s.players;
    const st = await toVote(s);
    const [A, B, C] = st.options!;
    await vote(s, ava, 1, A.id);
    await vote(s, ben, 1, A.id);
    await vote(s, cleo, 1, B.id);
    await settleEffects();

    const bad = await hostAct(s, { action: "forceWin", optionId: "nope" });
    expect(bad.status).toBe(400);
    const res = await hostAct(s, { action: "forceWin", optionId: C.id });
    expect(res.body.state.phase).toBe("REVEAL");
    await settleEffects();
    const after = await getState(s);
    expect(after.outcome?.optionId).toBe(C.id);
    expect(after.outcome?.narration).toContain("Hire a pigeon");
    expect((await roundRow(db, s.showId, 1)).winnerOptionId).toBe(C.id);
    expect((await receiptRows(s, 1, "CANON")).map((r) => r.userId)).toEqual([cleo.id]);
  });

  it("host actions need the host key", async () => {
    const s = await newShow({ autoAdvance: true });
    const res = await hostAct({ code: s.code, hostKey: "not-the-key" }, { action: "start" });
    expect(res.status).toBe(403);
    expect((await engineRow(db, s.roomId)).phase).toBe("LOBBY");
  });
});

describe("C3: moderation", () => {
  it("deleteIdea hides it for clients by (userId, clientMsgId) and removes it from the distill input", async () => {
    const s = await newShow({ autoAdvance: true });
    const [ava] = s.players;
    await hostAct(s, { action: "start" });
    await tickToDeadline(s.roomId);
    const bad = await addIdea(db, s.showId, 1, ava.id, "Something rude", clock.now + 1);
    await addIdea(db, s.showId, 1, ava.id, "Something fine", clock.now + 2);
    const [row] = await db.select().from(schema.ideas).where(eq(schema.ideas.id, bad));

    const res = await hostAct(s, { action: "deleteIdea", ideaId: bad });
    expect(res.status).toBe(200);
    expect((await db.select().from(schema.ideas).where(eq(schema.ideas.id, bad)))[0].status).toBe("deleted");
    expect(rt.messages.at(-1)).toMatchObject({ from: NARRATOR_USER_ID, msg: { t: "mod", hide: [{ userId: ava.id, clientMsgId: row.clientMsgId }] } });
    expect((await hostAct(s, { action: "deleteIdea", ideaId: "ghost" })).status).toBe(404);

    await tickToDeadline(s.roomId);
    await settleEffects();
    expect(ai.distillCalls.at(-1)?.ideas.map((i) => i.text)).toEqual(["Something fine"]);
  });

  it("mute and ban set server-side flags, call the transport, and a ban blocks the user's ideas and votes", async () => {
    const s = await newShow({ autoAdvance: true });
    const [ava, ben, cleo] = s.players;
    await hostAct(s, { action: "start" });
    await tickToDeadline(s.roomId);
    await addIdea(db, s.showId, 1, ava.id, "Ava idea one", clock.now + 1);
    await addIdea(db, s.showId, 1, ben.id, "Ben idea", clock.now + 2);
    await addIdea(db, s.showId, 1, cleo.id, "Cleo idea", clock.now + 3);

    expect((await hostAct(s, { action: "mute", userId: ben.id, on: true })).status).toBe(200);
    expect(rt.moderation.at(-1)).toMatchObject({ userId: ben.id, action: "mute" });
    expect((await db.select().from(schema.participants).where(eq(schema.participants.userId, ben.id)))[0].muted).toBe(true);
    await hostAct(s, { action: "mute", userId: ben.id, on: false });
    expect(rt.moderation.at(-1)).toMatchObject({ action: "unmute" });

    expect((await hostAct(s, { action: "ban", userId: ava.id, on: true })).status).toBe(200);
    expect(rt.moderation.at(-1)).toMatchObject({ userId: ava.id, action: "ban" });
    expect(rt.mods().at(-1)).toMatchObject({ hideUserIds: [ava.id] });
    const statuses = await db
      .select({ user: schema.ideas.userId, status: schema.ideas.status })
      .from(schema.ideas)
      .innerJoin(schema.rounds, eq(schema.rounds.id, schema.ideas.roundId))
      .where(eq(schema.rounds.showId, s.showId));
    expect(statuses.find((x) => x.user === ava.id)?.status).toBe("blocked");
    expect(statuses.find((x) => x.user === ben.id)?.status).toBe("ok");
    expect((await hostAct(s, { action: "ban", userId: "nobody", on: true })).status).toBe(404);

    await tickToDeadline(s.roomId);
    await settleEffects();
    expect(ai.distillCalls.at(-1)?.ideas.map((i) => i.text).sort()).toEqual(["Ben idea", "Cleo idea"]);
    const opts = (await getState(s)).options!;
    const banned = await vote(s, ava, 1, opts[0].id);
    expect(banned.status).toBe(403);
    expect(banned.body.code).toBe("BANNED");

    await hostAct(s, { action: "ban", userId: ava.id, on: false });
    expect(rt.moderation.at(-1)).toMatchObject({ action: "unban" });
    expect((await vote(s, ava, 1, opts[0].id)).status).toBe(200);
  });

  it("strictFilter updates the room and shows in the host feed", async () => {
    const s = await newShow({ autoAdvance: true });
    expect((await hostAct(s, { action: "strictFilter", on: false })).status).toBe(200);
    const feed = await call<HostFeedRes>(feedRoute, new Request("http://localhost/x", { headers: { "x-host-key": s.hostKey } }), s.code);
    expect(feed.body.metrics.strictFilter).toBe(false);
    const [room] = await db.select().from(schema.rooms).where(eq(schema.rooms.id, s.roomId));
    expect(room.strictFilter).toBe(false);
  });

  it("voice toggles through the host route and reaches the engine payload", async () => {
    const s = await newShow({ autoAdvance: true });
    await hostAct(s, { action: "voice", on: true });
    expect((await engineRow(db, s.roomId)).payload).toMatchObject({ voice: true });
    const feed = await call<HostFeedRes>(feedRoute, new Request("http://localhost/x", { headers: { "x-host-key": s.hostKey } }), s.code);
    expect(feed.body.metrics.voice).toBe(true);
  });
});
