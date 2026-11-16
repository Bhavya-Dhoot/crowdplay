import { describe, expect, it } from "vitest";
import { IDEA_REJECT_CODES } from "@/lib/api/contracts";
import { creditLine, ERROR_COPY, friendlyError, NAME_PARTS, PHASE_LABEL, phaseAnnouncement, randomName } from "@/lib/copy";

describe("error copy", () => {
  it("covers every idea reject code", () => {
    for (const code of IDEA_REJECT_CODES) {
      expect(ERROR_COPY[code], code).toBeTruthy();
      expect(friendlyError(code)).toBe(ERROR_COPY[code]);
    }
  });

  it("covers the session, room, host and network codes", () => {
    for (const code of ["NO_SESSION", "NAME_BLOCKED", "ROOM_FULL", "BAD_HOST_KEY", "NOT_FOUND", "INTERNAL", "NETWORK"]) {
      expect(ERROR_COPY[code as keyof typeof ERROR_COPY], code).toBeTruthy();
      expect(friendlyError(code)).toBe(ERROR_COPY[code as keyof typeof ERROR_COPY]);
    }
  });

  it("never sounds technical", () => {
    for (const [code, text] of Object.entries(ERROR_COPY)) {
      expect(text, code).not.toMatch(/\b(error|exception|500|403|404|undefined|null|stack|http|api)\b/i);
      expect(text.length, code).toBeGreaterThan(8);
    }
  });

  it("falls back to the server wording, then to a generic line, for unknown codes", () => {
    expect(friendlyError("SOMETHING_NEW", "The vault is closed.")).toBe("The vault is closed.");
    expect(friendlyError("SOMETHING_NEW")).toBe(ERROR_COPY.INTERNAL);
    expect(friendlyError(undefined)).toBe(ERROR_COPY.INTERNAL);
    expect(friendlyError("toString")).toBe(ERROR_COPY.INTERNAL);
  });
});

describe("creditLine", () => {
  const a = { name: "priya", bot: false };
  const b = { name: "sam", bot: false };
  const c = { name: "Zed", bot: true };

  it("lists up to three names and counts the rest", () => {
    expect(creditLine([a, b, { name: "lee", bot: false }], 4)).toBe("@priya, @sam, @lee + 4 others");
    expect(creditLine([a], 23)).toBe("@priya + 23 others");
  });

  it("uses the singular for one other", () => {
    expect(creditLine([a, b], 1)).toBe("@priya, @sam + 1 other");
  });

  it("marks bots with the robot emoji", () => {
    expect(creditLine([a, c], 0)).toBe("@priya, @Zed 🤖");
    expect(creditLine([c], 2)).toBe("@Zed 🤖 + 2 others");
  });

  it("handles no names and no extras", () => {
    expect(creditLine([], 0)).toBe("");
    expect(creditLine([], 5)).toBe("5 people");
    expect(creditLine([], 1)).toBe("1 person");
    expect(creditLine([a], -3)).toBe("@priya");
  });
});

describe("randomName", () => {
  it("looks like 'Brave Otter'", () => {
    for (const r of [0, 0.25, 0.5, 0.999999]) {
      expect(randomName(() => r)).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    }
    for (let i = 0; i < 200; i++) expect(randomName()).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
  });

  it("fits the 2-20 character display name rule for every combination", () => {
    for (const adj of NAME_PARTS.adjectives) {
      for (const animal of NAME_PARTS.animals) {
        const n = `${adj} ${animal}`;
        expect(n.length).toBeGreaterThanOrEqual(2);
        expect(n.length).toBeLessThanOrEqual(20);
      }
    }
  });

  it("is deterministic for a given rng and varies with it", () => {
    expect(randomName(() => 0)).toBe(`${NAME_PARTS.adjectives[0]} ${NAME_PARTS.animals[0]}`);
    expect(randomName(() => 0.99999)).toBe(`${NAME_PARTS.adjectives.at(-1)} ${NAME_PARTS.animals.at(-1)}`);
    expect(new Set(Array.from({ length: 100 }, () => randomName())).size).toBeGreaterThan(20);
  });
});

describe("phase copy", () => {
  it("labels every phase", () => {
    for (const p of ["LOBBY", "PROMPT", "STORM", "DISTILL", "VOTE", "REVEAL", "FINALE", "ENDED"] as const) {
      expect(PHASE_LABEL[p], p).toBeTruthy();
    }
  });

  it("announces the round for live phases and the pause", () => {
    expect(phaseAnnouncement({ phase: "STORM", roundNo: 2, roundsTotal: 6, paused: false })).toBe("Round 2 of 6. Idea storm. Type your ideas now.");
    expect(phaseAnnouncement({ phase: "LOBBY", roundNo: 0, roundsTotal: 6, paused: false })).toBe("Waiting room. Waiting for the host to start.");
    expect(phaseAnnouncement({ phase: "VOTE", roundNo: 1, roundsTotal: 3, paused: true })).toBe("The host paused the show.");
  });
});
