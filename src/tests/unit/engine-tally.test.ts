import { describe, expect, it } from "vitest";
import { isRoomBusy, resetLocks, withRoomLock } from "@/lib/engine/lock";
import { pickWinner, type TallyOption } from "@/lib/engine/tally";

const A: TallyOption = { id: "oa", slot: "A", firstIdeaAt: 3000 };
const B: TallyOption = { id: "ob", slot: "B", firstIdeaAt: 1000 };
const C: TallyOption = { id: "oc", slot: "C", firstIdeaAt: null };

describe("pickWinner", () => {
  it("highest tally wins", () => {
    const r = pickWinner([A, B, C], { oa: 2, ob: 5, oc: 1 }, null);
    expect(r).toEqual({ winnerId: "ob", reason: "majority", tied: [] });
  });

  it("a forced live option beats the tally", () => {
    expect(pickWinner([A, B, C], { oa: 9, ob: 0, oc: 0 }, "oc")).toMatchObject({ winnerId: "oc", reason: "forced" });
  });

  it("a forced id that is not a live option is ignored", () => {
    expect(pickWinner([A, B, C], { oa: 3, ob: 0, oc: 0 }, "ghost")).toMatchObject({ winnerId: "oa", reason: "majority" });
  });

  it("tie goes to the earliest first supporting idea (FR-20)", () => {
    const r = pickWinner([A, B, C], { oa: 4, ob: 4, oc: 1 }, null);
    expect(r.winnerId).toBe("ob");
    expect(r.reason).toBe("tiebreak");
    expect(r.tied).toEqual(["ob", "oa"]);
  });

  it("narrator options (no supporting idea) lose ties against crowd options", () => {
    expect(pickWinner([A, B, C], { oa: 2, ob: 0, oc: 2 }, null).winnerId).toBe("oa");
  });

  it("an all-zero ballot is a three-way tie decided the same way", () => {
    const r = pickWinner([A, B, C], {}, null);
    expect(r.winnerId).toBe("ob");
    expect(r.tied).toEqual(["ob", "oa", "oc"]);
  });

  it("equal idea times fall back to slot order, and all-narrator ballots pick slot A", () => {
    const x: TallyOption = { id: "x", slot: "B", firstIdeaAt: 500 };
    const y: TallyOption = { id: "y", slot: "A", firstIdeaAt: 500 };
    expect(pickWinner([x, y], { x: 1, y: 1 }, null).winnerId).toBe("y");
    const n = (id: string, slot: "A" | "B" | "C"): TallyOption => ({ id, slot, firstIdeaAt: null });
    expect(pickWinner([n("c", "C"), n("a", "A"), n("b", "B")], {}, null).winnerId).toBe("a");
  });

  it("no options -> no winner", () => {
    expect(pickWinner([], {}, "x")).toEqual({ winnerId: null, reason: "none", tied: [] });
  });
});

describe("withRoomLock", () => {
  it("serialises holders of the same key and lets different keys run together", async () => {
    resetLocks();
    const order: string[] = [];
    const slow = withRoomLock("r1", async () => {
      order.push("a:start");
      await new Promise((r) => setTimeout(r, 30));
      order.push("a:end");
    });
    const second = withRoomLock("r1", async () => {
      order.push("b");
    });
    const other = withRoomLock("r2", async () => {
      order.push("c");
    });
    expect(isRoomBusy("r1")).toBe(true);
    await Promise.all([slow, second, other]);
    expect(order.indexOf("a:end")).toBeLessThan(order.indexOf("b"));
    expect(order.indexOf("c")).toBeLessThan(order.indexOf("a:end"));
    expect(isRoomBusy("r1")).toBe(false);
  });

  it("a failing holder releases the lock and only rejects its own caller", async () => {
    resetLocks();
    const failed = withRoomLock("r1", async () => {
      throw new Error("boom");
    });
    const ok = withRoomLock("r1", async () => "fine");
    await expect(failed).rejects.toThrow("boom");
    await expect(ok).resolves.toBe("fine");
    expect(isRoomBusy("r1")).toBe(false);
  });
});
