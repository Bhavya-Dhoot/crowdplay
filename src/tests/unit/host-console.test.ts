import { describe, expect, it } from "vitest";
import {
  actionToast,
  aiProviderLabel,
  aiStatus,
  aiTime,
  controlAvailability,
  filterPlayers,
  headcount,
  hostErrorMessage,
  ideaStatusLabel,
  isOnline,
  newerState,
  newestFirst,
  ONLINE_WINDOW_MS,
  originLinks,
  primarySpec,
  resolveLinks,
  shortLink,
  timeline,
  votePercent,
} from "@/components/host/consoleLogic";
import { hostPath, loadHostKey, resolveHostKey, saveHostKey, type KeyStore } from "@/components/host/hostKey";
import type { Phase, PublicState } from "@/lib/realtime/types";

type S = Parameters<typeof primarySpec>[0];
const base = (over: Partial<S> = {}): S => ({
  phase: "LOBBY",
  roundNo: 1,
  roundsTotal: 3,
  paused: false,
  phaseEndsAt: 10_000,
  showId: "sh_abc",
  stats: { players: 0, ideasThisRound: 0, ideasTotal: 0, canonMakers: 0 },
  ...over,
});

describe("primarySpec: the stage key follows the phase", () => {
  const cases: [Phase, string, string | null][] = [
    ["LOBBY", "Start show", "start"],
    ["PROMPT", "Start storm now", "next"],
    ["STORM", "End storm now", "endStorm"],
    ["DISTILL", "Reading ideas…", null],
    ["VOTE", "Reveal now", "next"],
    ["REVEAL", "Next round", "next"],
    ["FINALE", "End show", "endShow"],
    ["ENDED", "Read the story", null],
  ];
  it.each(cases)("%s -> %s", (phase, label, action) => {
    const s = primarySpec(base({ phase }));
    expect(s.label).toBe(label);
    expect(s.action?.action ?? null).toBe(action);
  });

  it("REVEAL on the last round says Finale", () => {
    expect(primarySpec(base({ phase: "REVEAL", roundNo: 3, roundsTotal: 3 })).label).toBe("Finale");
    expect(primarySpec(base({ phase: "REVEAL", roundNo: 2, roundsTotal: 3 })).hint).toContain("round 3 of 3");
  });

  it("DISTILL is a disabled waiting state", () => {
    const s = primarySpec(base({ phase: "DISTILL" }));
    expect(s.disabled).toBe(true);
    expect(s.waiting).toBe(true);
  });

  it("ENDED links to the story page", () => {
    const s = primarySpec(base({ phase: "ENDED" }));
    expect(s.href).toBe("/story/sh_abc");
    expect(s.disabled).toBe(false);
  });

  it("is disabled while paused, because the engine ignores it", () => {
    const s = primarySpec(base({ phase: "STORM", paused: true }));
    expect(s.disabled).toBe(true);
    expect(s.hint).toMatch(/Resume/);
  });

  it("counts players and ideas in the hint without inventing numbers", () => {
    expect(primarySpec(base({ stats: { players: 1, ideasThisRound: 0, ideasTotal: 0, canonMakers: 0 } })).hint).toContain("1 player is");
    expect(primarySpec(base({ phase: "STORM", stats: { players: 5, ideasThisRound: 12, ideasTotal: 12, canonMakers: 0 } })).hint).toContain("12 ideas so far");
    expect(primarySpec(base({ phase: "STORM" })).hint).not.toMatch(/\d/);
  });
});

describe("controlAvailability mirrors the engine", () => {
  it("pause needs a running clock in PROMPT / STORM / VOTE / REVEAL", () => {
    for (const phase of ["PROMPT", "STORM", "VOTE", "REVEAL"] as Phase[]) expect(controlAvailability(base({ phase })).canPause).toBe(true);
    for (const phase of ["LOBBY", "DISTILL", "FINALE", "ENDED"] as Phase[]) expect(controlAvailability(base({ phase })).canPause).toBe(false);
    // Manual-mode REVEAL holds with no deadline: nothing to pause.
    expect(controlAvailability(base({ phase: "REVEAL", phaseEndsAt: null })).canPause).toBe(false);
  });

  it("+10 s is STORM / VOTE only", () => {
    expect(controlAvailability(base({ phase: "STORM" })).canExtend).toBe(true);
    expect(controlAvailability(base({ phase: "VOTE" })).canExtend).toBe(true);
    expect(controlAvailability(base({ phase: "REVEAL" })).canExtend).toBe(false);
  });

  it("veto, force win and re-roll are VOTE only and stop while paused", () => {
    expect(controlAvailability(base({ phase: "VOTE" })).canModerateVote).toBe(true);
    expect(controlAvailability(base({ phase: "STORM" })).canModerateVote).toBe(false);
    expect(controlAvailability(base({ phase: "VOTE", paused: true, phaseEndsAt: null })).canModerateVote).toBe(false);
  });

  it("paused offers Resume only", () => {
    const a = controlAvailability(base({ phase: "STORM", paused: true, phaseEndsAt: null }));
    expect(a.canResume).toBe(true);
    expect(a.canPause).toBe(false);
    expect(a.canExtend).toBe(false);
  });

  it("End show is available until the show has ended", () => {
    expect(controlAvailability(base({ phase: "LOBBY" })).canEnd).toBe(true);
    expect(controlAvailability(base({ phase: "ENDED" })).canEnd).toBe(false);
  });
});

describe("newerState", () => {
  const st = (v: number, serverNow: number) => ({ v, serverNow }) as PublicState;
  it("takes the higher version", () => {
    const a = st(4, 100);
    const b = st(5, 90);
    expect(newerState(a, b)).toBe(b);
    expect(newerState(b, a)).toBe(b);
  });
  it("breaks ties with the later server clock", () => {
    const a = st(5, 100);
    const b = st(5, 200);
    expect(newerState(a, b)).toBe(b);
    expect(newerState(b, a)).toBe(b);
  });
  it("copes with missing sides", () => {
    const a = st(1, 1);
    expect(newerState(null, a)).toBe(a);
    expect(newerState(a, undefined)).toBe(a);
    expect(newerState(null, null)).toBeNull();
  });
});

describe("ballot and roster helpers", () => {
  it("votePercent rounds and never divides by zero", () => {
    expect(votePercent(0, 0)).toBe(0);
    expect(votePercent(1, 3)).toBe(33);
    expect(votePercent(2, 3)).toBe(67);
    expect(votePercent(5, 5)).toBe(100);
    expect(votePercent(7, 5)).toBe(100);
  });

  it("filterPlayers is a case-insensitive substring match", () => {
    const ps = [{ name: "Brave Otter" }, { name: "Sneaky Newt" }, { name: "Mighty otter" }];
    expect(filterPlayers(ps, "OTTER")).toHaveLength(2);
    expect(filterPlayers(ps, "  ")).toHaveLength(3);
    expect(filterPlayers(ps, "zzz")).toHaveLength(0);
  });

  it("isOnline uses the 45 s window", () => {
    expect(isOnline(1_000, 1_000 + ONLINE_WINDOW_MS)).toBe(true);
    expect(isOnline(1_000, 1_001 + ONLINE_WINDOW_MS)).toBe(false);
  });

  it("newestFirst sorts by time and keeps later rows on top for ties", () => {
    const out = newestFirst([
      { id: "a", createdAt: 1 },
      { id: "b", createdAt: 3 },
      { id: "c", createdAt: 3 },
    ]);
    expect(out.map((x) => x.id)).toEqual(["c", "b", "a"]);
  });

  it("ideaStatusLabel", () => {
    expect(ideaStatusLabel("ok")).toBeNull();
    expect(ideaStatusLabel("blocked")).toMatch(/filter/);
    expect(ideaStatusLabel("deleted")).toBe("Removed");
    expect(ideaStatusLabel("blocked", true)).toBe("Player removed");
    expect(ideaStatusLabel("ok", true)).toBeNull();
  });
});

describe("links and errors", () => {
  it("originLinks builds join, screen and OBS links", () => {
    expect(originLinks("https://x.test/", "ABCDE")).toEqual({
      join: "https://x.test/join/ABCDE",
      screen: "https://x.test/screen/ABCDE",
      obs: "https://x.test/screen/ABCDE?obs=1",
    });
    expect(shortLink("https://x.test/join/ABCDE")).toBe("x.test/join/ABCDE");
  });

  it("host-only error codes get friendly copy; others use the shared table", () => {
    expect(hostErrorMessage("REROLL_USED")).toMatch(/re-roll/);
    expect(hostErrorMessage("BAD_OPTION")).toMatch(/options/);
    expect(hostErrorMessage("IDEA_NOT_FOUND")).toMatch(/gone/);
    expect(hostErrorMessage("BAD_HOST_KEY")).toMatch(/host link/);
    expect(hostErrorMessage("WHAT", "Server says hi")).toBe("Server says hi");
  });
});

function memoryStore(): KeyStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe("host key storage", () => {
  it("round-trips a key per room code", () => {
    const s = memoryStore();
    saveHostKey("abcde", "KEY1", [s]);
    expect(loadHostKey("ABCDE", [s])).toBe("KEY1");
    expect(loadHostKey("ZZZZZ", [s])).toBeNull();
  });

  it("the URL key wins over the remembered one", () => {
    const s = memoryStore();
    saveHostKey("ABCDE", "OLD", [s]);
    expect(resolveHostKey("NEW", "ABCDE", [s])).toBe("NEW");
    expect(resolveHostKey("  ", "ABCDE", [s])).toBe("OLD");
    expect(resolveHostKey(null, "ABCDE", [s])).toBe("OLD");
    expect(resolveHostKey(null, "QQQQQ", [s])).toBeNull();
  });

  it("survives a store that throws", () => {
    const broken: KeyStore = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {},
    };
    const ok = memoryStore();
    expect(() => saveHostKey("ABCDE", "K", [broken, ok])).not.toThrow();
    expect(loadHostKey("ABCDE", [broken, ok])).toBe("K");
  });

  it("hostPath encodes the key", () => {
    expect(hostPath("ABCDE", "a b/c")).toBe("/host/ABCDE?k=a%20b%2Fc");
  });
});

describe("headcount: one players count", () => {
  const now = 1_000_000;
  const p = (lastSeenAt: number, banned = false) => ({ lastSeenAt, banned });

  it("joined skips removed players, online needs a page seen in the last 45 s", () => {
    const c = headcount([p(now), p(now - 10_000), p(now - ONLINE_WINDOW_MS - 1), p(now, true)], now);
    expect(c).toEqual({ joined: 3, online: 2 });
  });

  it("an empty room is zero and zero", () => {
    expect(headcount([], now)).toEqual({ joined: 0, online: 0 });
  });

  it("online can never exceed joined", () => {
    const c = headcount([p(now), p(now, true), p(now, true)], now);
    expect(c.online).toBeLessThanOrEqual(c.joined);
  });
});

describe("timeline", () => {
  it("LOBBY: nothing started, every round and phase is still to come", () => {
    const t = timeline({ phase: "LOBBY", roundNo: 1, roundsTotal: 3 });
    expect(t.rounds.map((r) => r.status)).toEqual(["next", "next", "next"]);
    expect(t.steps.every((s) => s.status === "next")).toBe(true);
    expect(t.caption).toBe("Waiting to start");
    expect(t.label).toBe("3 rounds");
  });

  it("marks finished rounds, the live round and the live phase", () => {
    const t = timeline({ phase: "VOTE", roundNo: 2, roundsTotal: 4 });
    expect(t.rounds.map((r) => r.status)).toEqual(["done", "now", "next", "next"]);
    expect(t.steps.map((s) => [s.label, s.status])).toEqual([
      ["Scene", "done"],
      ["Ideas", "done"],
      ["Reading", "done"],
      ["Vote", "now"],
      ["Reveal", "next"],
    ]);
    expect(t.caption).toBe("Round 2 of 4");
    expect(t.label).toBeNull();
  });

  it("FINALE and ENDED finish everything", () => {
    for (const phase of ["FINALE", "ENDED"] as const) {
      const t = timeline({ phase, roundNo: 3, roundsTotal: 3 });
      expect(t.rounds.every((r) => r.status === "done")).toBe(true);
      expect(t.steps.every((s) => s.status === "done")).toBe(true);
    }
    expect(timeline({ phase: "ENDED", roundNo: 3, roundsTotal: 3 }).caption).toBe("Show ended");
    expect(timeline({ phase: "FINALE", roundNo: 3, roundsTotal: 3 }).caption).toBe("Story complete");
  });

  it("always has exactly one live phase during a round", () => {
    for (const phase of ["PROMPT", "STORM", "DISTILL", "VOTE", "REVEAL"] as const) {
      expect(timeline({ phase, roundNo: 1, roundsTotal: 3 }).steps.filter((s) => s.status === "now")).toHaveLength(1);
    }
  });
});

describe("plain words for diagnostics", () => {
  it("aiTime keeps ms under a second and shows seconds above it", () => {
    expect(aiTime(859)).toBe("859 ms");
    expect(aiTime(2400)).toBe("2.4 s");
    expect(aiTime(null)).toBe("—");
    expect(aiTime(undefined)).toBe("—");
    expect(aiTime(-5)).toBe("—");
  });

  it("names the provider without jargon, and passes unknown ones through", () => {
    expect(aiProviderLabel("heuristic")).toBe("Simple options, no AI");
    expect(aiProviderLabel("anthropic")).toBe("Claude");
    expect(aiProviderLabel("somethingnew")).toBe("somethingnew");
    expect(aiProviderLabel(null)).toBeUndefined();
  });

  it("AI status says Backup options used, never fallback", () => {
    expect(aiStatus({ fallbackUsed: true })).toEqual({ text: "Backup options used", warn: true });
    expect(aiStatus({ fallbackUsed: false })).toEqual({ text: "Working normally", warn: false });
    expect(aiStatus(null).warn).toBe(false);
  });
});

describe("actionToast", () => {
  it("confirms what the host did, in the words of the button", () => {
    expect(actionToast({ action: "pause" })?.title).toBe("Show paused");
    expect(actionToast({ action: "resume" })?.title).toBe("Show resumed");
    expect(actionToast({ action: "extend", ms: 10000 })?.title).toBe("Added 10 seconds");
    expect(actionToast({ action: "veto", optionId: "o1" })?.title).toBe("Option vetoed");
    expect(actionToast({ action: "mute", userId: "u", on: true })?.title).toBe("Player muted");
    expect(actionToast({ action: "mute", userId: "u", on: false })?.title).toBe("Player unmuted");
    expect(actionToast({ action: "ban", userId: "u", on: false })?.title).toBe("Player let back in");
    expect(actionToast({ action: "autoAdvance", on: false })?.title).toBe("Auto-advance is off");
  });

  it("stays quiet when the screen already shows the change", () => {
    for (const action of [{ action: "start" }, { action: "next" }, { action: "endStorm" }, { action: "endShow" }, { action: "heartbeat" }] as const) {
      expect(actionToast(action)).toBeNull();
    }
  });
});

describe("resolveLinks", () => {
  it("uses the server's links once the feed is here", () => {
    const links = { join: "https://x.test/join/ABCDE", play: "p", screen: "https://x.test/screen/ABCDE", obs: "https://x.test/screen/ABCDE?obs=1", host: "https://x.test/host/ABCDE?k=K" };
    expect(resolveLinks({ links }, "http://localhost:3000", "ABCDE", "K")).toEqual({ join: links.join, screen: links.screen, obs: links.obs, host: links.host });
  });

  it("builds them from the origin until then, including the host key", () => {
    const l = resolveLinks(null, "http://localhost:3000", "ABCDE", "k e/y");
    expect(l.join).toBe("http://localhost:3000/join/ABCDE");
    expect(l.obs).toBe("http://localhost:3000/screen/ABCDE?obs=1");
    expect(l.host).toBe("http://localhost:3000/host/ABCDE?k=k%20e%2Fy");
  });
});
