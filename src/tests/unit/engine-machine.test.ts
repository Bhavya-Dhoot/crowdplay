import { describe, expect, it } from "vitest";
import { DISTILL_GRACE_MS, next } from "@/lib/engine/machine";
import type { Effect, EngineState, Trigger } from "@/lib/engine/types";
import type { Phase } from "@/lib/realtime/types";

const T = { promptMs: 6000, stormMs: 30000, voteMs: 12000, revealMs: 12000, distillCapMs: 10000 };
const NOW = 1_000_000;

function mk(phase: Phase, over: Partial<EngineState> = {}, payload: Partial<EngineState["payload"]> = {}): EngineState {
  const timed: Partial<Record<Phase, number>> = {
    PROMPT: T.promptMs,
    STORM: T.stormMs,
    DISTILL: T.distillCapMs,
    VOTE: T.voteMs,
    REVEAL: T.revealMs,
  };
  const ms = timed[phase];
  return {
    roomId: "room1",
    showId: "show1",
    isDemo: false,
    phase,
    roundNo: phase === "LOBBY" ? 0 : 1,
    roundsTotal: 3,
    phaseStartedAt: NOW,
    phaseEndsAt: ms === undefined ? null : NOW + ms,
    pausedRemainingMs: null,
    version: 7,
    autoAdvance: true,
    timings: T,
    payload: {
      rerollUsed: false,
      distill: phase === "DISTILL" ? "running" : phase === "VOTE" || phase === "REVEAL" ? "done" : "idle",
      forcedWinnerId: null,
      voice: false,
      ...payload,
    },
    ...over,
  };
}

const types = (effects: Effect[]) => effects.map((e) => e.type);
const deadline = (s: EngineState) => s.phaseEndsAt ?? NOW;

describe("machine: transitions", () => {
  it("LOBBY + HOST_START -> PROMPT round 1 with reset payload and effects", () => {
    const s = mk("LOBBY", {}, { rerollUsed: true, distill: "done", forcedWinnerId: "x", voice: true });
    const r = next(s, NOW, { type: "HOST_START" });
    expect(r.changed).toBe(true);
    expect(r.state.phase).toBe("PROMPT");
    expect(r.state.roundNo).toBe(1);
    expect(r.state.phaseStartedAt).toBe(NOW);
    expect(r.state.phaseEndsAt).toBe(NOW + T.promptMs);
    expect(r.state.version).toBe(8);
    expect(r.state.payload).toEqual({ rerollUsed: false, distill: "idle", forcedWinnerId: null, voice: true });
    expect(r.effects).toEqual([
      { type: "GEN_PROMPT", roundNo: 1, mode: "ensure" },
      { type: "PUBLISH", phaseChanged: true },
    ]);
  });

  it("PROMPT -> STORM on TICK at the deadline and on HOST_NEXT; not before the deadline", () => {
    const s = mk("PROMPT");
    expect(next(s, deadline(s) - 1, { type: "TICK" }).changed).toBe(false);
    for (const [now, trigger] of [
      [deadline(s), { type: "TICK" }],
      [NOW + 100, { type: "HOST_NEXT" }],
    ] as [number, Trigger][]) {
      const r = next(s, now, trigger);
      expect(r.state.phase).toBe("STORM");
      expect(r.state.phaseStartedAt).toBe(now);
      expect(r.state.phaseEndsAt).toBe(now + T.stormMs);
      expect(r.effects).toEqual([{ type: "PUBLISH", phaseChanged: true }]);
    }
  });

  it("PROMPT -> STORM starts bots in a demo room, before PUBLISH", () => {
    const r = next(mk("PROMPT", { isDemo: true }), NOW + T.promptMs, { type: "TICK" });
    expect(r.effects).toEqual([
      { type: "START_BOTS", roundNo: 1 },
      { type: "PUBLISH", phaseChanged: true },
    ]);
  });

  it("STORM -> DISTILL on TICK, HOST_END_STORM and HOST_NEXT", () => {
    const s = mk("STORM");
    for (const [now, trigger] of [
      [deadline(s), { type: "TICK" }],
      [NOW + 5, { type: "HOST_END_STORM" }],
      [NOW + 5, { type: "HOST_NEXT" }],
    ] as [number, Trigger][]) {
      const r = next(s, now, trigger);
      expect(r.state.phase).toBe("DISTILL");
      expect(r.state.phaseEndsAt).toBe(now + T.distillCapMs);
      expect(r.state.payload.distill).toBe("running");
      expect(r.effects).toEqual([
        { type: "RUN_DISTILL", roundNo: 1, mode: "full" },
        { type: "PUBLISH", phaseChanged: true },
      ]);
    }
  });

  it("DISTILL + DISTILL_DONE -> VOTE with BALLOT receipts; demo adds bot votes", () => {
    const r = next(mk("DISTILL"), NOW + 2000, { type: "DISTILL_DONE", roundNo: 1 });
    expect(r.state.phase).toBe("VOTE");
    expect(r.state.phaseEndsAt).toBe(NOW + 2000 + T.voteMs);
    expect(r.state.payload.distill).toBe("done");
    expect(r.effects).toEqual([
      { type: "SEND_RECEIPTS", roundNo: 1, kind: "BALLOT" },
      { type: "PUBLISH", phaseChanged: true },
    ]);
    const demo = next(mk("DISTILL", { isDemo: true }), NOW + 2000, { type: "DISTILL_DONE", roundNo: 1 });
    expect(types(demo.effects)).toEqual(["SEND_RECEIPTS", "START_BOT_VOTES", "PUBLISH"]);
  });

  it("stale or mismatched DISTILL_DONE changes nothing", () => {
    expect(next(mk("DISTILL"), NOW, { type: "DISTILL_DONE", roundNo: 2 }).changed).toBe(false);
    expect(next(mk("DISTILL", {}, { distill: "done" }), NOW, { type: "DISTILL_DONE", roundNo: 1 }).changed).toBe(false);
    expect(next(mk("VOTE"), NOW, { type: "DISTILL_DONE", roundNo: 1 }).changed).toBe(false);
    expect(next(mk("STORM"), NOW, { type: "DISTILL_DONE", roundNo: 1 }).changed).toBe(false);
  });

  it("DISTILL cap TICK or DISTILL_FAILED -> stay, 3 s grace, heuristic run", () => {
    const s = mk("DISTILL");
    for (const trigger of [{ type: "TICK" }, { type: "DISTILL_FAILED", roundNo: 1 }] as Trigger[]) {
      const now = deadline(s);
      const r = next(s, now, trigger);
      expect(r.changed).toBe(true);
      expect(r.state.phase).toBe("DISTILL");
      expect(r.state.phaseStartedAt).toBe(s.phaseStartedAt);
      expect(r.state.phaseEndsAt).toBe(now + DISTILL_GRACE_MS);
      expect(r.state.version).toBe(s.version + 1);
      expect(r.effects).toEqual([
        { type: "RUN_DISTILL", roundNo: 1, mode: "heuristic" },
        { type: "PUBLISH", phaseChanged: false },
      ]);
    }
    expect(next(s, deadline(s) - 1, { type: "TICK" }).changed).toBe(false);
    expect(next(s, NOW, { type: "DISTILL_FAILED", roundNo: 9 }).changed).toBe(false);
    expect(next(mk("DISTILL", {}, { distill: "done" }), deadline(s), { type: "TICK" }).changed).toBe(false);
  });

  it("VOTE -> REVEAL: CLOSE_VOTE before PUBLISH, then receipts, narration, next prompt", () => {
    const s = mk("VOTE");
    const r = next(s, deadline(s), { type: "TICK" });
    expect(r.state.phase).toBe("REVEAL");
    expect(r.state.phaseEndsAt).toBe(deadline(s) + T.revealMs);
    expect(r.effects).toEqual([
      { type: "CLOSE_VOTE", roundNo: 1, forcedWinnerId: null },
      { type: "PUBLISH", phaseChanged: true },
      { type: "SEND_RECEIPTS", roundNo: 1, kind: "CANON" },
      { type: "GEN_NARRATION", roundNo: 1 },
      { type: "GEN_PROMPT", roundNo: 2, mode: "pregen" },
    ]);
    expect(next(s, deadline(s) - 1, { type: "TICK" }).changed).toBe(false);
    expect(next(s, NOW + 10, { type: "HOST_NEXT" }).state.phase).toBe("REVEAL");
  });

  it("VOTE -> REVEAL in the last round does not pregenerate a prompt", () => {
    const s = mk("VOTE", { roundNo: 3 });
    const r = next(s, deadline(s), { type: "TICK" });
    expect(types(r.effects)).toEqual(["CLOSE_VOTE", "PUBLISH", "SEND_RECEIPTS", "GEN_NARRATION"]);
  });

  it("REVEAL holds (phaseEndsAt null) in manual mode, and TICK does nothing there", () => {
    const s = mk("VOTE", { autoAdvance: false });
    const r = next(s, deadline(s), { type: "TICK" });
    expect(r.state.phase).toBe("REVEAL");
    expect(r.state.phaseEndsAt).toBeNull();
    expect(next(r.state, deadline(s) + 999_999, { type: "TICK" }).changed).toBe(false);
    const n = next(r.state, deadline(s) + 5, { type: "HOST_NEXT" });
    expect(n.state.phase).toBe("PROMPT");
    expect(n.state.roundNo).toBe(2);
  });

  it("REVEAL -> PROMPT(roundNo+1) with fresh payload (voice kept)", () => {
    const s = mk("REVEAL", {}, { rerollUsed: true, forcedWinnerId: "o1", voice: true });
    const r = next(s, deadline(s), { type: "TICK" });
    expect(r.state.phase).toBe("PROMPT");
    expect(r.state.roundNo).toBe(2);
    expect(r.state.payload).toEqual({ rerollUsed: false, distill: "idle", forcedWinnerId: null, voice: true });
    expect(r.effects).toEqual([
      { type: "GEN_PROMPT", roundNo: 2, mode: "ensure" },
      { type: "PUBLISH", phaseChanged: true },
    ]);
  });

  it("REVEAL after the last round -> FINALE with no deadline", () => {
    const s = mk("REVEAL", { roundNo: 3 });
    for (const trigger of [{ type: "TICK" }, { type: "HOST_NEXT" }] as Trigger[]) {
      const r = next(s, deadline(s), trigger);
      expect(r.state.phase).toBe("FINALE");
      expect(r.state.phaseEndsAt).toBeNull();
      expect(r.state.roundNo).toBe(3);
      expect(r.effects).toEqual([{ type: "GEN_FINALE" }, { type: "PUBLISH", phaseChanged: true }]);
    }
  });
});

describe("machine: host controls", () => {
  it("HOST_EXTEND adds time in STORM and VOTE only", () => {
    for (const phase of ["STORM", "VOTE"] as Phase[]) {
      const s = mk(phase);
      const r = next(s, NOW + 1, { type: "HOST_EXTEND", ms: 10000 });
      expect(r.state.phaseEndsAt).toBe(deadline(s) + 10000);
      expect(r.state.phase).toBe(phase);
      expect(r.effects).toEqual([{ type: "PUBLISH", phaseChanged: false }]);
    }
    for (const phase of ["LOBBY", "PROMPT", "DISTILL", "REVEAL", "FINALE", "ENDED"] as Phase[]) {
      expect(next(mk(phase), NOW + 1, { type: "HOST_EXTEND", ms: 10000 }).changed).toBe(false);
    }
  });

  it("HOST_FORCE_WIN in VOTE -> REVEAL carrying the forced id into CLOSE_VOTE", () => {
    const r = next(mk("VOTE"), NOW + 3, { type: "HOST_FORCE_WIN", optionId: "opt_b" });
    expect(r.state.phase).toBe("REVEAL");
    expect(r.state.payload.forcedWinnerId).toBe("opt_b");
    expect(r.effects[0]).toEqual({ type: "CLOSE_VOTE", roundNo: 1, forcedWinnerId: "opt_b" });
    expect(next(mk("STORM"), NOW, { type: "HOST_FORCE_WIN", optionId: "opt_b" }).changed).toBe(false);
  });

  it("HOST_VETO stays in VOTE: REPLACE_OPTION then PUBLISH(false), version+1", () => {
    const s = mk("VOTE");
    const r = next(s, NOW + 3, { type: "HOST_VETO", optionId: "opt_a" });
    expect(r.state.phase).toBe("VOTE");
    expect(r.state.phaseEndsAt).toBe(s.phaseEndsAt);
    expect(r.state.version).toBe(s.version + 1);
    expect(r.effects).toEqual([
      { type: "REPLACE_OPTION", roundNo: 1, optionId: "opt_a" },
      { type: "PUBLISH", phaseChanged: false },
    ]);
    expect(next(mk("REVEAL"), NOW, { type: "HOST_VETO", optionId: "opt_a" }).changed).toBe(false);
  });

  it("HOST_REROLL works once per round, returning to DISTILL", () => {
    const first = next(mk("VOTE"), NOW + 4, { type: "HOST_REROLL" });
    expect(first.state.phase).toBe("DISTILL");
    expect(first.state.payload).toMatchObject({ rerollUsed: true, distill: "running" });
    expect(first.state.phaseEndsAt).toBe(NOW + 4 + T.distillCapMs);
    expect(first.effects).toEqual([
      { type: "RUN_DISTILL", roundNo: 1, mode: "reroll" },
      { type: "PUBLISH", phaseChanged: true },
    ]);
    const done = next(first.state, NOW + 6, { type: "DISTILL_DONE", roundNo: 1 });
    expect(done.state.phase).toBe("VOTE");
    expect(done.state.payload.rerollUsed).toBe(true);
    expect(next(done.state, NOW + 7, { type: "HOST_REROLL" }).changed).toBe(false);
  });

  it("HOST_PAUSE / HOST_RESUME keep the remaining time and ignore TICK while paused", () => {
    const s = mk("STORM");
    const p = next(s, NOW + 10_000, { type: "HOST_PAUSE" });
    expect(p.state.pausedRemainingMs).toBe(T.stormMs - 10_000);
    expect(p.state.phaseEndsAt).toBeNull();
    expect(p.effects).toEqual([{ type: "PUBLISH", phaseChanged: false }]);
    expect(next(p.state, NOW + 999_999, { type: "TICK" }).changed).toBe(false);
    expect(next(p.state, NOW + 20_000, { type: "HOST_NEXT" }).changed).toBe(false);
    expect(next(p.state, NOW + 20_000, { type: "HOST_PAUSE" }).changed).toBe(false);
    const r = next(p.state, NOW + 50_000, { type: "HOST_RESUME" });
    expect(r.state.pausedRemainingMs).toBeNull();
    expect(r.state.phaseEndsAt).toBe(NOW + 50_000 + T.stormMs - 10_000);
  });

  it("HOST_PAUSE clamps to zero and needs a running deadline", () => {
    const s = mk("VOTE");
    expect(next(s, deadline(s) + 500, { type: "HOST_PAUSE" }).state.pausedRemainingMs).toBe(0);
    expect(next(mk("REVEAL", { phaseEndsAt: null, autoAdvance: false }), NOW, { type: "HOST_PAUSE" }).changed).toBe(false);
    for (const phase of ["LOBBY", "DISTILL", "FINALE", "ENDED"] as Phase[]) {
      expect(next(mk(phase), NOW, { type: "HOST_PAUSE" }).changed).toBe(false);
    }
    expect(next(mk("STORM"), NOW, { type: "HOST_RESUME" }).changed).toBe(false);
  });

  it("while paused only RESUME, END_SHOW, SET_AUTO and SET_VOICE act", () => {
    const paused = next(mk("VOTE"), NOW + 1000, { type: "HOST_PAUSE" }).state;
    const blocked: Trigger[] = [
      { type: "TICK" },
      { type: "HOST_NEXT" },
      { type: "HOST_START" },
      { type: "HOST_END_STORM" },
      { type: "HOST_EXTEND", ms: 5000 },
      { type: "HOST_FORCE_WIN", optionId: "o" },
      { type: "HOST_VETO", optionId: "o" },
      { type: "HOST_REROLL" },
      { type: "DISTILL_DONE", roundNo: 1 },
    ];
    for (const t of blocked) expect(next(paused, NOW + 2000, t).changed).toBe(false);
    expect(next(paused, NOW + 2000, { type: "HOST_SET_AUTO", on: false }).state.autoAdvance).toBe(false);
    expect(next(paused, NOW + 2000, { type: "HOST_SET_VOICE", on: true }).state.payload.voice).toBe(true);
    const end = next(paused, NOW + 2000, { type: "HOST_END_SHOW" });
    expect(end.state.phase).toBe("FINALE");
    expect(end.state.pausedRemainingMs).toBeNull();
  });

  it("resuming a paused REVEAL in manual mode keeps holding", () => {
    const s = mk("REVEAL");
    const p = next(s, NOW + 2000, { type: "HOST_PAUSE" }).state;
    const manual = next(p, NOW + 3000, { type: "HOST_SET_AUTO", on: false }).state;
    expect(manual.pausedRemainingMs).not.toBeNull();
    const r = next(manual, NOW + 4000, { type: "HOST_RESUME" });
    expect(r.state.phaseEndsAt).toBeNull();
    expect(r.state.pausedRemainingMs).toBeNull();
  });

  it("HOST_SET_AUTO in REVEAL starts or clears the countdown; elsewhere it only flips the flag", () => {
    const rev = mk("REVEAL");
    const off = next(rev, NOW + 100, { type: "HOST_SET_AUTO", on: false });
    expect(off.state.autoAdvance).toBe(false);
    expect(off.state.phaseEndsAt).toBeNull();
    expect(off.effects).toEqual([{ type: "PUBLISH", phaseChanged: false }]);
    const on = next(off.state, NOW + 500, { type: "HOST_SET_AUTO", on: true });
    expect(on.state.phaseEndsAt).toBe(NOW + 500 + T.revealMs);
    expect(next(rev, NOW, { type: "HOST_SET_AUTO", on: true }).changed).toBe(false);
    const storm = next(mk("STORM"), NOW + 100, { type: "HOST_SET_AUTO", on: false });
    expect(storm.state.autoAdvance).toBe(false);
    expect(storm.state.phaseEndsAt).toBe(NOW + T.stormMs);
  });

  it("HOST_SET_VOICE toggles payload.voice and publishes without a phase change", () => {
    const r = next(mk("PROMPT"), NOW, { type: "HOST_SET_VOICE", on: true });
    expect(r.state.payload.voice).toBe(true);
    expect(r.effects).toEqual([{ type: "PUBLISH", phaseChanged: false }]);
    expect(next(r.state, NOW, { type: "HOST_SET_VOICE", on: true }).changed).toBe(false);
  });

  it("HOST_END_SHOW: FINALE -> ENDED, LOBBY -> ENDED, any live phase -> FINALE with GEN_FINALE", () => {
    for (const phase of ["PROMPT", "STORM", "DISTILL", "VOTE", "REVEAL"] as Phase[]) {
      const r = next(mk(phase), NOW + 1, { type: "HOST_END_SHOW" });
      expect(r.state.phase).toBe("FINALE");
      expect(r.state.phaseEndsAt).toBeNull();
      expect(r.effects).toEqual([{ type: "GEN_FINALE" }, { type: "PUBLISH", phaseChanged: true }]);
    }
    for (const phase of ["FINALE", "LOBBY"] as Phase[]) {
      const r = next(mk(phase), NOW + 1, { type: "HOST_END_SHOW" });
      expect(r.state.phase).toBe("ENDED");
      expect(r.effects).toEqual([{ type: "PUBLISH", phaseChanged: true }]);
    }
  });
});

describe("machine: every phase x trigger", () => {
  const ALL: Trigger[] = [
    { type: "TICK" },
    { type: "HOST_START" },
    { type: "HOST_NEXT" },
    { type: "HOST_END_STORM" },
    { type: "HOST_EXTEND", ms: 5000 },
    { type: "HOST_PAUSE" },
    { type: "HOST_RESUME" },
    { type: "HOST_FORCE_WIN", optionId: "o" },
    { type: "HOST_VETO", optionId: "o" },
    { type: "HOST_REROLL" },
    { type: "HOST_END_SHOW" },
    { type: "HOST_SET_AUTO", on: false },
    { type: "HOST_SET_VOICE", on: true },
    { type: "DISTILL_DONE", roundNo: 1 },
    { type: "DISTILL_FAILED", roundNo: 1 },
  ];
  // Which trigger types change state in each phase (TICK evaluated at the deadline).
  const ACTS: Record<Phase, string[]> = {
    LOBBY: ["HOST_START", "HOST_END_SHOW", "HOST_SET_AUTO", "HOST_SET_VOICE"],
    PROMPT: ["TICK", "HOST_NEXT", "HOST_PAUSE", "HOST_END_SHOW", "HOST_SET_AUTO", "HOST_SET_VOICE"],
    STORM: ["TICK", "HOST_NEXT", "HOST_END_STORM", "HOST_EXTEND", "HOST_PAUSE", "HOST_END_SHOW", "HOST_SET_AUTO", "HOST_SET_VOICE"],
    DISTILL: ["TICK", "DISTILL_DONE", "DISTILL_FAILED", "HOST_END_SHOW", "HOST_SET_AUTO", "HOST_SET_VOICE"],
    VOTE: [
      "TICK",
      "HOST_NEXT",
      "HOST_EXTEND",
      "HOST_PAUSE",
      "HOST_FORCE_WIN",
      "HOST_VETO",
      "HOST_REROLL",
      "HOST_END_SHOW",
      "HOST_SET_AUTO",
      "HOST_SET_VOICE",
    ],
    REVEAL: ["TICK", "HOST_NEXT", "HOST_PAUSE", "HOST_END_SHOW", "HOST_SET_AUTO", "HOST_SET_VOICE"],
    FINALE: ["HOST_END_SHOW", "HOST_SET_AUTO", "HOST_SET_VOICE"],
    ENDED: [],
  };

  for (const phase of Object.keys(ACTS) as Phase[]) {
    it(`${phase}: acts on exactly the documented triggers`, () => {
      const s = mk(phase);
      const at = s.phaseEndsAt ?? NOW;
      const acted = ALL.filter((t) => {
        const r = next(s, at, t);
        if (r.changed) expect(r.state.version).toBe(s.version + 1);
        else expect(r.state).toBe(s);
        return r.changed;
      }).map((t) => t.type);
      expect(acted.sort()).toEqual([...ACTS[phase]].sort());
    });
  }

  it("never mutates the input state", () => {
    const s = mk("VOTE");
    const copy = structuredClone(s);
    for (const t of ALL) next(s, NOW + 100_000, t);
    expect(s).toEqual(copy);
  });
});

describe("machine: a manual 3-round show", () => {
  it("walks LOBBY -> ... -> FINALE -> ENDED on host triggers alone", () => {
    let s = mk("LOBBY", { autoAdvance: false });
    let now = NOW;
    const step = (t: Trigger) => {
      now += 1000;
      const r = next(s, now, t);
      expect(r.changed).toBe(true);
      s = r.state;
    };
    step({ type: "HOST_START" });
    for (let round = 1; round <= 3; round++) {
      expect(s.roundNo).toBe(round);
      step({ type: "HOST_NEXT" }); // PROMPT -> STORM
      step({ type: "HOST_END_STORM" }); // -> DISTILL
      step({ type: "DISTILL_DONE", roundNo: round }); // -> VOTE
      step({ type: "HOST_NEXT" }); // -> REVEAL (manual: holds)
      expect(s.phase).toBe("REVEAL");
      expect(s.phaseEndsAt).toBeNull();
      step({ type: "HOST_NEXT" }); // -> PROMPT | FINALE
    }
    expect(s.phase).toBe("FINALE");
    step({ type: "HOST_END_SHOW" });
    expect(s.phase).toBe("ENDED");
    expect(s.version).toBe(7 + 1 + 3 * 5 + 1);
  });
});
