// Pure round state machine (TECH_SPEC §5.1). No I/O: advance.ts persists the result and runs the effects.
import type { Effect, EnginePayload, EngineState, MachineResult, Trigger } from "./types";

/** After the DISTILL cap passes, the heuristic path gets this long before the next forced retry. */
export const DISTILL_GRACE_MS = 3000;

const unchanged = (state: EngineState): MachineResult => ({ state, effects: [], changed: false });

type Patch = Partial<Omit<EngineState, "roomId" | "showId" | "version">>;

/** Apply a patch: version+1, phaseStartedAt=now on a phase change, PUBLISH between `before` and `after`. */
function commit(prev: EngineState, now: number, patch: Patch, before: Effect[] = [], after: Effect[] = []): MachineResult {
  const phaseChanged = patch.phase !== undefined && patch.phase !== prev.phase;
  const state: EngineState = {
    ...prev,
    ...patch,
    version: prev.version + 1,
    phaseStartedAt: phaseChanged ? now : prev.phaseStartedAt,
  };
  return { state, effects: [...before, { type: "PUBLISH", phaseChanged }, ...after], changed: true };
}

const freshPayload = (p: EnginePayload): EnginePayload => ({
  rerollUsed: false,
  distill: "idle",
  forcedWinnerId: null,
  voice: p.voice,
});

function enterPrompt(s: EngineState, now: number, roundNo: number): MachineResult {
  return commit(
    s,
    now,
    {
      phase: "PROMPT",
      roundNo,
      phaseEndsAt: now + s.timings.promptMs,
      pausedRemainingMs: null,
      payload: freshPayload(s.payload),
    },
    [{ type: "GEN_PROMPT", roundNo, mode: "ensure" }],
  );
}

function enterStorm(s: EngineState, now: number): MachineResult {
  const bots: Effect[] = s.isDemo ? [{ type: "START_BOTS", roundNo: s.roundNo }] : [];
  return commit(s, now, { phase: "STORM", phaseEndsAt: now + s.timings.stormMs, pausedRemainingMs: null }, bots);
}

function enterDistill(s: EngineState, now: number, mode: "full" | "reroll", payload: EnginePayload): MachineResult {
  return commit(
    s,
    now,
    { phase: "DISTILL", phaseEndsAt: now + s.timings.distillCapMs, pausedRemainingMs: null, payload },
    [{ type: "RUN_DISTILL", roundNo: s.roundNo, mode }],
  );
}

function enterVote(s: EngineState, now: number): MachineResult {
  const effects: Effect[] = [{ type: "SEND_RECEIPTS", roundNo: s.roundNo, kind: "BALLOT" }];
  if (s.isDemo) effects.push({ type: "START_BOT_VOTES", roundNo: s.roundNo });
  return commit(
    s,
    now,
    {
      phase: "VOTE",
      phaseEndsAt: now + s.timings.voteMs,
      pausedRemainingMs: null,
      payload: { ...s.payload, distill: "done" },
    },
    effects,
  );
}

function enterReveal(s: EngineState, now: number, forcedWinnerId: string | null): MachineResult {
  const after: Effect[] = [{ type: "SEND_RECEIPTS", roundNo: s.roundNo, kind: "CANON" }];
  if (s.roundNo < s.roundsTotal) after.push({ type: "GEN_PROMPT", roundNo: s.roundNo + 1, mode: "pregen" });
  const forced = forcedWinnerId ?? s.payload.forcedWinnerId;
  return commit(
    s,
    now,
    {
      phase: "REVEAL",
      phaseEndsAt: s.autoAdvance ? now + s.timings.revealMs : null,
      pausedRemainingMs: null,
      payload: { ...s.payload, forcedWinnerId: forced },
    },
    // The narration needs the winner (CLOSE_VOTE) but not the published REVEAL, so it starts before PUBLISH
    // and overlaps the Nexconn REST publish; its own publish waits for that one (effects.ts).
    [
      { type: "CLOSE_VOTE", roundNo: s.roundNo, forcedWinnerId: forced },
      { type: "GEN_NARRATION", roundNo: s.roundNo },
    ],
    after,
  );
}

function enterFinale(s: EngineState, now: number): MachineResult {
  return commit(s, now, { phase: "FINALE", phaseEndsAt: null, pausedRemainingMs: null }, [{ type: "GEN_FINALE" }]);
}

function afterReveal(s: EngineState, now: number): MachineResult {
  return s.roundNo >= s.roundsTotal ? enterFinale(s, now) : enterPrompt(s, now, s.roundNo + 1);
}

/** DISTILL ran past its cap (or the full run failed): force the no-LLM path and give it a short grace period. */
function distillGrace(s: EngineState, now: number): MachineResult {
  if (s.payload.distill !== "running") return unchanged(s);
  return commit(s, now, { phaseEndsAt: now + DISTILL_GRACE_MS }, [{ type: "RUN_DISTILL", roundNo: s.roundNo, mode: "heuristic" }]);
}

function endShow(s: EngineState, now: number): MachineResult {
  if (s.phase === "FINALE" || s.phase === "LOBBY") {
    return commit(s, now, { phase: "ENDED", phaseEndsAt: null, pausedRemainingMs: null });
  }
  return enterFinale(s, now);
}

function setAuto(s: EngineState, now: number, on: boolean): MachineResult {
  if (s.autoAdvance === on) return unchanged(s);
  const patch: Patch = { autoAdvance: on };
  // A running (not paused) REVEAL either starts its countdown or holds for the host.
  if (s.phase === "REVEAL" && s.pausedRemainingMs === null) {
    patch.phaseEndsAt = on ? (s.phaseEndsAt ?? now + s.timings.revealMs) : null;
  }
  return commit(s, now, patch);
}

function pause(s: EngineState, now: number): MachineResult {
  const pausable = s.phase === "PROMPT" || s.phase === "STORM" || s.phase === "VOTE" || s.phase === "REVEAL";
  if (!pausable || s.pausedRemainingMs !== null || s.phaseEndsAt === null) return unchanged(s);
  return commit(s, now, { pausedRemainingMs: Math.max(0, s.phaseEndsAt - now), phaseEndsAt: null });
}

function resume(s: EngineState, now: number): MachineResult {
  if (s.pausedRemainingMs === null) return unchanged(s);
  const holds = s.phase === "REVEAL" && !s.autoAdvance;
  return commit(s, now, { pausedRemainingMs: null, phaseEndsAt: holds ? null : now + s.pausedRemainingMs });
}

function extend(s: EngineState, now: number, ms: number): MachineResult {
  const extendable = s.phase === "STORM" || s.phase === "VOTE";
  if (!extendable || s.pausedRemainingMs !== null || s.phaseEndsAt === null || !(ms > 0)) return unchanged(s);
  return commit(s, now, { phaseEndsAt: s.phaseEndsAt + ms });
}

/** next(state, now, trigger): the whole round lifecycle as one pure function. Invalid triggers change nothing. */
export function next(state: EngineState, now: number, trigger: Trigger): MachineResult {
  if (state.phase === "ENDED") return unchanged(state);

  // Triggers that work in any live phase (and while paused).
  switch (trigger.type) {
    case "HOST_END_SHOW":
      return endShow(state, now);
    case "HOST_SET_AUTO":
      return setAuto(state, now, trigger.on);
    case "HOST_SET_VOICE":
      return state.payload.voice === trigger.on
        ? unchanged(state)
        : commit(state, now, { payload: { ...state.payload, voice: trigger.on } });
    case "HOST_RESUME":
      return resume(state, now);
    default:
      break;
  }
  if (state.pausedRemainingMs !== null) return unchanged(state);

  const due = state.phaseEndsAt !== null && now >= state.phaseEndsAt;

  switch (state.phase) {
    case "LOBBY":
      return trigger.type === "HOST_START" && state.roundsTotal >= 1 ? enterPrompt(state, now, 1) : unchanged(state);

    case "PROMPT":
      if ((trigger.type === "TICK" && due) || trigger.type === "HOST_NEXT") return enterStorm(state, now);
      if (trigger.type === "HOST_PAUSE") return pause(state, now);
      return unchanged(state);

    case "STORM":
      if ((trigger.type === "TICK" && due) || trigger.type === "HOST_END_STORM" || trigger.type === "HOST_NEXT") {
        return enterDistill(state, now, "full", { ...state.payload, distill: "running" });
      }
      if (trigger.type === "HOST_EXTEND") return extend(state, now, trigger.ms);
      if (trigger.type === "HOST_PAUSE") return pause(state, now);
      return unchanged(state);

    case "DISTILL":
      if (trigger.type === "DISTILL_DONE") {
        return trigger.roundNo === state.roundNo && state.payload.distill === "running" ? enterVote(state, now) : unchanged(state);
      }
      if (trigger.type === "DISTILL_FAILED") return trigger.roundNo === state.roundNo ? distillGrace(state, now) : unchanged(state);
      if (trigger.type === "TICK" && due) return distillGrace(state, now);
      return unchanged(state);

    case "VOTE":
      if ((trigger.type === "TICK" && due) || trigger.type === "HOST_NEXT") return enterReveal(state, now, null);
      switch (trigger.type) {
        case "HOST_FORCE_WIN":
          return enterReveal(state, now, trigger.optionId);
        case "HOST_VETO":
          return commit(state, now, {}, [{ type: "REPLACE_OPTION", roundNo: state.roundNo, optionId: trigger.optionId }]);
        case "HOST_REROLL":
          return state.payload.rerollUsed
            ? unchanged(state)
            : enterDistill(state, now, "reroll", { ...state.payload, rerollUsed: true, distill: "running" });
        case "HOST_EXTEND":
          return extend(state, now, trigger.ms);
        case "HOST_PAUSE":
          return pause(state, now);
        default:
          return unchanged(state);
      }

    case "REVEAL":
      if ((trigger.type === "TICK" && due) || trigger.type === "HOST_NEXT") return afterReveal(state, now);
      if (trigger.type === "HOST_PAUSE") return pause(state, now);
      return unchanged(state);

    default:
      return unchanged(state); // FINALE: only END_SHOW / SET_* act (handled above)
  }
}
