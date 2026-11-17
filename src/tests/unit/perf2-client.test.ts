// PERF2 client: the idea feed renders an isolated idea at once, and phase changes use the cheap /me endpoint.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRoomMe } from "@/lib/client/api";
import { createLeadingBatcher } from "@/lib/client/useRoom";

describe("createLeadingBatcher (idea feed)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => vi.useRealTimers());

  it("delivers an isolated item immediately", () => {
    const out: number[][] = [];
    const b = createLeadingBatcher<number>((items) => out.push(items), 120);
    b.push(1);
    expect(out).toEqual([[1]]);
  });

  it("batches a burst: first at once, the rest together once the gap has passed", () => {
    const out: number[][] = [];
    const b = createLeadingBatcher<number>((items) => out.push(items), 120);
    b.push(1);
    vi.advanceTimersByTime(10);
    b.push(2);
    vi.advanceTimersByTime(10);
    b.push(3);
    expect(out).toEqual([[1]]);
    vi.advanceTimersByTime(99);
    expect(out).toEqual([[1]]);
    vi.advanceTimersByTime(1); // 120 ms after the first delivery
    expect(out).toEqual([[1], [2, 3]]);
  });

  it("never delivers more than once per gap, however fast the items arrive", () => {
    const out: number[][] = [];
    const b = createLeadingBatcher<number>((items) => out.push(items), 120);
    for (let t = 0; t < 1000; t += 5) {
      b.push(t);
      vi.advanceTimersByTime(5);
    }
    vi.advanceTimersByTime(200);
    expect(out.length).toBeLessThanOrEqual(1000 / 120 + 2);
    expect(out.flat()).toHaveLength(200); // nothing lost
  });

  it("an item after a quiet gap is leading-edge again", () => {
    const out: number[][] = [];
    const b = createLeadingBatcher<number>((items) => out.push(items), 120);
    b.push(1);
    vi.advanceTimersByTime(500);
    b.push(2);
    expect(out).toEqual([[1], [2]]);
  });

  it("clear() drops what is waiting", () => {
    const out: number[][] = [];
    const b = createLeadingBatcher<number>((items) => out.push(items), 120);
    b.push(1);
    b.push(2);
    b.clear();
    vi.advanceTimersByTime(500);
    expect(out).toEqual([[1]]);
  });
});

describe("getRoomMe", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("GETs /api/rooms/:code/me and returns my view without touching /join", async () => {
    const me = { userId: "u_1", displayName: "Ava", vote: null, muted: false, banned: false, myOptionIds: ["op_1"], ideasThisRound: 2 };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, me }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await getRoomMe("AB12");
    expect(r).toEqual({ ok: true, me });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/rooms/AB12/me");
    expect(init.method).toBe("GET");
  });

  it("surfaces NOT_PARTICIPANT so the caller can fall back to a full join", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ ok: false, code: "NOT_PARTICIPANT", message: "Join the room first." }), { status: 403 }));
    const r = await getRoomMe("AB12");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("NOT_PARTICIPANT");
  });
});
