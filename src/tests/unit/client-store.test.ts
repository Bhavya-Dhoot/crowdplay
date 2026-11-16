import { describe, expect, it, vi } from "vitest";
import type { MeInRoom } from "@/lib/api/contracts";
import { CHEER_CAP, FEED_CAP, initialStore, needsResync, reduce, type IncomingIdea, type RoomAction, type RoomStore } from "@/lib/client/store";
import type { PublicState } from "@/lib/realtime/types";

// The real filter belongs to the ingest area; the store only needs "is this text clean?".
vi.mock("@/lib/ingest/filter", () => ({ isClean: (t: string) => !/badword/i.test(t) }));

const baseState = (over: Partial<PublicState> = {}): PublicState => ({
  v: 1,
  roomCode: "ABCDE",
  showId: "show_1",
  phase: "STORM",
  roundNo: 1,
  roundsTotal: 3,
  phaseStartedAt: 1000,
  phaseEndsAt: 31_000,
  serverNow: 1000,
  paused: false,
  title: "Test show",
  premise: "A premise that is long enough.",
  preset: "heist",
  isDemo: false,
  stats: { players: 1, ideasThisRound: 0, ideasTotal: 0, canonMakers: 0 },
  storySoFar: [],
  ...over,
});

const me = (over: Partial<MeInRoom> = {}): MeInRoom => ({
  userId: "u_me",
  displayName: "Me Myself",
  vote: null,
  muted: false,
  banned: false,
  myOptionIds: [],
  ideasThisRound: 0,
  ...over,
});

const run = (actions: RoomAction[], from: RoomStore = initialStore()): RoomStore => actions.reduce(reduce, from);
const idea = (userId: string, clientMsgId: string, text = "an idea", roundNo = 1): IncomingIdea => ({
  t: "idea",
  userId,
  clientMsgId,
  text,
  roundNo,
  name: userId.toUpperCase(),
});
const ideas = (...items: IncomingIdea[]): RoomAction => ({ type: "ideas", items, now: 5 });
const withMe = (): RoomStore => run([{ type: "identity", userId: "u_me", name: "Me Myself" }, { type: "state", state: baseState() }, { type: "me", me: me() }]);

describe("full state", () => {
  it("is accepted when v is equal or newer and ignored when older", () => {
    let s = run([{ type: "state", state: baseState({ v: 5, title: "five" }) }]);
    expect(s.state?.title).toBe("five");
    s = reduce(s, { type: "state", state: baseState({ v: 4, title: "four" }) });
    expect(s.state?.title).toBe("five");
    s = reduce(s, { type: "state", state: baseState({ v: 5, title: "five again" }) });
    expect(s.state?.title).toBe("five again");
    s = reduce(s, { type: "state", state: baseState({ v: 6, title: "six" }) });
    expect(s.state?.v).toBe(6);
  });
});

describe("metadata patch", () => {
  it("merges fields when v >= current and bumps v", () => {
    const s = run([
      { type: "state", state: baseState({ v: 3 }) },
      { type: "patch", v: 4, fields: { phase: "DISTILL", phaseEndsAt: 9999 } },
    ]);
    expect(s.state).toMatchObject({ v: 4, phase: "DISTILL", phaseEndsAt: 9999, title: "Test show" });
  });

  it("accepts an equal v and ignores an older one", () => {
    let s = run([{ type: "state", state: baseState({ v: 3 }) }]);
    s = reduce(s, { type: "patch", v: 3, fields: { title: "same v" } });
    expect(s.state?.title).toBe("same v");
    s = reduce(s, { type: "patch", v: 2, fields: { title: "old" } });
    expect(s.state?.title).toBe("same v");
  });

  it("does nothing before the first full state", () => {
    expect(run([{ type: "patch", v: 9, fields: { title: "x" } }]).state).toBeNull();
  });

  it("does not let undefined fields erase what we know", () => {
    const s = run([
      { type: "state", state: baseState({ v: 1 }) },
      { type: "patch", v: 2, fields: { phase: undefined, title: "kept phase" } },
    ]);
    expect(s.state).toMatchObject({ phase: "STORM", title: "kept phase" });
  });

  it("clears last round's options, tally and outcome when the round changes", () => {
    const options = [{ id: "o1", slot: "A" as const, kind: "crowd" as const, label: "x", supporters: 2, credit: [], more: 0 }];
    const s = run([
      {
        type: "state",
        state: baseState({
          v: 5,
          phase: "REVEAL",
          options,
          tally: { o1: 4 },
          votesTotal: 4,
          outcome: { optionId: "o1", narration: "n", credit: [], more: 0 },
          prompt: { title: "t", text: "t" },
        }),
      },
      { type: "patch", v: 6, fields: { phase: "PROMPT", roundNo: 2 } },
    ]);
    expect(s.state).toMatchObject({ phase: "PROMPT", roundNo: 2 });
    expect(s.state?.options).toBeUndefined();
    expect(s.state?.tally).toBeUndefined();
    expect(s.state?.outcome).toBeUndefined();
    expect(s.state?.prompt).toBeUndefined();
  });

  it("keeps the round's data when the patch carries the new options itself", () => {
    const options = [{ id: "n1", slot: "A" as const, kind: "crowd" as const, label: "new", supporters: 1, credit: [], more: 0 }];
    const s = run([
      { type: "state", state: baseState({ v: 5, roundNo: 1 }) },
      { type: "patch", v: 6, fields: { roundNo: 2, options } },
    ]);
    expect(s.state?.options).toEqual(options);
  });
});

describe("tally", () => {
  const tally = (v: number, roundNo: number, votes: Record<string, number>, total: number) =>
    ({ type: "tally", tally: { t: "tally", v, roundNo, tally: votes, total } }) as RoomAction;

  it("applies when tally.v >= state.v and the round matches", () => {
    const s = run([{ type: "state", state: baseState({ v: 4, phase: "VOTE" }) }, tally(4, 1, { a: 3 }, 3)]);
    expect(s.state).toMatchObject({ tally: { a: 3 }, votesTotal: 3, v: 4 });
  });

  it("ignores an older v and a different round", () => {
    const start = run([{ type: "state", state: baseState({ v: 4, phase: "VOTE" }) }]);
    expect(reduce(start, tally(3, 1, { a: 9 }, 9)).state?.tally).toBeUndefined();
    expect(reduce(start, tally(4, 2, { a: 9 }, 9)).state?.tally).toBeUndefined();
  });

  it("applies a newer tally but flags that a state update was missed", () => {
    const s = run([{ type: "state", state: baseState({ v: 4 }) }, tally(6, 1, { a: 1 }, 1)]);
    expect(s.state?.tally).toEqual({ a: 1 });
    expect(needsResync(s)).toBe(true);
    expect(needsResync(reduce(s, { type: "state", state: baseState({ v: 6 }) }))).toBe(false);
  });
});

describe("idea feed", () => {
  it("dedupes by userId + clientMsgId but keeps the same id from different users", () => {
    const s = run([{ type: "state", state: baseState() }, ideas(idea("u_a", "m1"), idea("u_a", "m1"), idea("u_b", "m1"))]);
    expect(s.feed.map((f) => f.key)).toEqual(["u_a:m1", "u_b:m1"]);
  });

  it("caps the feed at 200, dropping the oldest", () => {
    const many = Array.from({ length: FEED_CAP + 50 }, (_, i) => idea("u_a", `m${i}`));
    const s = run([{ type: "state", state: baseState() }, ideas(...many)]);
    expect(s.feed).toHaveLength(FEED_CAP);
    expect(s.feed[0].clientMsgId).toBe("m50");
    expect(s.feed.at(-1)?.clientMsgId).toBe(`m${FEED_CAP + 49}`);
  });

  it("drops ideas that fail the client pre-filter, empty ones and over-long ones", () => {
    const s = run([
      { type: "state", state: baseState() },
      ideas(idea("u_a", "m1", "a badword here"), idea("u_a", "m2", "   "), idea("u_a", "m3", "x".repeat(401)), idea("u_a", "m4", "fine")),
    ]);
    expect(s.feed.map((f) => f.clientMsgId)).toEqual(["m4"]);
  });

  it("shows my own bubble at once, then reconciles it with the transport echo", () => {
    let s = withMe();
    s = reduce(s, { type: "ideaPending", clientMsgId: "c1", text: "my idea", name: "Me Myself", now: 10 });
    expect(s.feed).toMatchObject([{ key: "u_me:c1", mine: true, status: "pending" }]);
    expect(s.me?.ideasThisRound).toBe(1);
    s = reduce(s, ideas(idea("u_me", "c1", "my idea")));
    expect(s.feed).toHaveLength(1);
    expect(s.feed[0].status).toBe("sent");
  });

  it("marks my bubble sent or rejected (with the code) from the server's answer", () => {
    let s = withMe();
    s = run(
      [
        { type: "ideaPending", clientMsgId: "c1", text: "one", name: "Me", now: 1 },
        { type: "ideaPending", clientMsgId: "c2", text: "two", name: "Me", now: 2 },
        { type: "ideaResult", clientMsgId: "c1", ok: true },
        { type: "ideaResult", clientMsgId: "c2", ok: false, code: "BLOCKED" },
      ],
      s,
    );
    expect(s.feed.map((f) => [f.status, f.rejectCode])).toEqual([
      ["sent", undefined],
      ["rejected", "BLOCKED"],
    ]);
    expect(s.me?.ideasThisRound).toBe(1);
  });

  it("flags ideas from other people as not mine", () => {
    const s = run([{ type: "identity", userId: "u_me", name: "Me" }, { type: "state", state: baseState() }, ideas(idea("u_x", "m1"))]);
    expect(s.feed[0]).toMatchObject({ mine: false, status: "sent" });
  });

  it("holds the current round only: a new round clears the feed and old-round ideas are ignored", () => {
    let s = run([{ type: "state", state: baseState({ v: 1, roundNo: 1 }) }, ideas(idea("u_a", "m1"))]);
    s = reduce(s, { type: "state", state: baseState({ v: 2, roundNo: 2 }) });
    expect(s.feed).toHaveLength(0);
    s = reduce(s, ideas(idea("u_a", "late", "late", 1), idea("u_a", "m2", "fresh", 2)));
    expect(s.feed.map((f) => f.clientMsgId)).toEqual(["m2"]);
  });

  it("starts the new round's feed if an idea outruns the state change", () => {
    let s = run([{ type: "state", state: baseState({ v: 1, roundNo: 1 }) }, ideas(idea("u_a", "m1"))]);
    s = reduce(s, ideas(idea("u_b", "n1", "early bird", 2)));
    expect(s.feed.map((f) => f.clientMsgId)).toEqual(["n1"]);
    s = reduce(s, { type: "state", state: baseState({ v: 2, roundNo: 2 }) });
    expect(s.feed.map((f) => f.clientMsgId)).toEqual(["n1"]);
  });

  it("returns the same object when nothing changed", () => {
    const s = run([{ type: "state", state: baseState() }, ideas(idea("u_a", "m1"))]);
    expect(reduce(s, ideas(idea("u_a", "m1")))).toBe(s);
  });
});

describe("moderation", () => {
  it("hides one idea by {userId, clientMsgId}", () => {
    const s = run([
      { type: "state", state: baseState() },
      ideas(idea("u_a", "m1"), idea("u_a", "m2"), idea("u_b", "m1")),
      { type: "moderation", mod: { t: "mod", hide: [{ userId: "u_a", clientMsgId: "m1" }] } },
    ]);
    expect(s.feed.map((f) => f.key)).toEqual(["u_a:m2", "u_b:m1"]);
  });

  it("hides everything from banned users, now and later", () => {
    const s = run([
      { type: "state", state: baseState() },
      ideas(idea("u_a", "m1"), idea("u_b", "m1")),
      { type: "moderation", mod: { t: "mod", hideUserIds: ["u_a"] } },
      ideas(idea("u_a", "m2"), idea("u_c", "m1")),
    ]);
    expect(s.feed.map((f) => f.key)).toEqual(["u_b:m1", "u_c:m1"]);
  });

  it("keeps a hidden idea hidden if it arrives after the moderation message", () => {
    const s = run([
      { type: "state", state: baseState() },
      { type: "moderation", mod: { t: "mod", hide: [{ userId: "u_a", clientMsgId: "m1" }] } },
      ideas(idea("u_a", "m1")),
    ]);
    expect(s.feed).toHaveLength(0);
  });
});

describe("me, votes, cheers and receipts", () => {
  it("resets round-scoped fields when the round advances, then accepts the fresh me", () => {
    let s = run([
      { type: "identity", userId: "u_me", name: "Me" },
      { type: "state", state: baseState({ v: 1, roundNo: 1 }) },
      { type: "me", me: me({ vote: "o1", myOptionIds: ["o1"], ideasThisRound: 2 }) },
    ]);
    s = reduce(s, { type: "state", state: baseState({ v: 2, roundNo: 2 }) });
    expect(s.me).toMatchObject({ vote: null, myOptionIds: [], ideasThisRound: 0 });
    s = reduce(s, { type: "me", me: me({ vote: "o9" }) });
    expect(s.me?.vote).toBe("o9");
  });

  it("sets, changes and rolls back my vote", () => {
    let s = run([{ type: "me", me: me() }]);
    s = reduce(s, { type: "vote", optionId: "o1" });
    expect(s.me?.vote).toBe("o1");
    s = reduce(s, { type: "vote", optionId: null });
    expect(s.me?.vote).toBeNull();
  });

  it("marks the options my ideas feed when a receipt names them", () => {
    let s = run([{ type: "state", state: baseState({ roundNo: 2 }) }, { type: "me", me: me() }]);
    const receipt = { t: "receipt" as const, type: "BALLOT" as const, showId: "show_1", roundNo: 2, optionId: "o2", optionLabel: "x", ideaText: "y" };
    s = reduce(s, { type: "receipt", receipt });
    s = reduce(s, { type: "receipt", receipt });
    expect(s.me?.myOptionIds).toEqual(["o2"]);
    expect(reduce(s, { type: "receipt", receipt: { ...receipt, roundNo: 1, optionId: "o7" } }).me?.myOptionIds).toEqual(["o2"]);
  });

  it("keeps the last 40 cheers with unique ids", () => {
    const actions: RoomAction[] = Array.from({ length: CHEER_CAP + 5 }, (_, i) => ({
      type: "cheer",
      cheer: { t: "cheer", emoji: "🔥", userId: "u_a" },
      now: i,
    }));
    const s = run(actions);
    expect(s.cheers).toHaveLength(CHEER_CAP);
    expect(new Set(s.cheers.map((c) => c.id)).size).toBe(CHEER_CAP);
    expect(s.cheers.at(-1)?.at).toBe(CHEER_CAP + 4);
  });

  it("reset returns a clean store", () => {
    expect(reduce(withMe(), { type: "reset" })).toEqual(initialStore());
  });
});
