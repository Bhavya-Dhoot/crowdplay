import { afterEach, describe, expect, it, vi } from "vitest";
import { medianOffset, offsetFromSample } from "@/lib/client/clock";
import { describeRemaining } from "@/lib/client/useCountdown";

describe("medianOffset", () => {
  it("returns 0 when there are no samples", () => {
    expect(medianOffset([])).toBe(0);
    expect(medianOffset([Number.NaN, Number.POSITIVE_INFINITY])).toBe(0);
  });

  it("takes the middle of an odd list regardless of order", () => {
    expect(medianOffset([300, -20, 40, 41, 39])).toBe(40);
    expect(medianOffset([7])).toBe(7);
  });

  it("averages the two middle samples of an even list", () => {
    expect(medianOffset([10, 20, 30, 40])).toBe(25);
    expect(medianOffset([1, 2])).toBe(2); // 1.5 rounds to 2
  });

  it("is robust to one wild sample (a slow response)", () => {
    expect(medianOffset([100, 101, 99, 100, 5000])).toBe(100);
  });

  it("ignores non-finite samples", () => {
    expect(medianOffset([10, Number.NaN, 30])).toBe(20);
  });

  it("does not mutate its input", () => {
    const xs = [3, 1, 2];
    medianOffset(xs);
    expect(xs).toEqual([3, 1, 2]);
  });
});

describe("offsetFromSample", () => {
  it("assumes the server stamped the time halfway through the round trip", () => {
    // sent at 1000, answered at 1100 (RTT 100): server clock read 5050 at local 1050 -> +4000
    expect(offsetFromSample(1000, 1100, 5050)).toBe(4000);
  });

  it("is zero when clocks agree", () => {
    expect(offsetFromSample(2000, 2000, 2000)).toBe(0);
  });
});

describe("syncClock", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/client/api");
  });

  it("takes 5 samples and settles on the median offset", async () => {
    vi.resetModules();
    const getTime = vi.fn(async () => ({ ok: true as const, now: Date.now() + 3000 }));
    vi.doMock("@/lib/client/api", () => ({ getTime }));
    const clock = await import("@/lib/client/clock");
    const offset = await clock.syncClock();
    expect(getTime).toHaveBeenCalledTimes(5);
    expect(Math.abs(offset - 3000)).toBeLessThan(50);
    expect(Math.abs(clock.serverNow() - Date.now() - 3000)).toBeLessThan(50);
  });

  it("skips failed samples and keeps the offset it had", async () => {
    vi.resetModules();
    const getTime = vi.fn(async () => ({ ok: false as const, code: "NETWORK", message: "x" }));
    vi.doMock("@/lib/client/api", () => ({ getTime }));
    const clock = await import("@/lib/client/clock");
    expect(await clock.syncClock()).toBe(0);
  });

  it("uses a state payload as a first guess only until a real sample lands", async () => {
    vi.resetModules();
    const getTime = vi.fn(async () => ({ ok: true as const, now: Date.now() + 100 }));
    vi.doMock("@/lib/client/api", () => ({ getTime }));
    const clock = await import("@/lib/client/clock");
    clock.seedOffset(Date.now() + 9000);
    expect(Math.abs(clock.getOffsetMs() - 9000)).toBeLessThan(50);
    await clock.syncClock();
    clock.seedOffset(Date.now() + 9000); // ignored now
    expect(Math.abs(clock.getOffsetMs() - 100)).toBeLessThan(50);
  });
});

describe("describeRemaining", () => {
  it("is empty when there is no deadline", () => {
    const d = describeRemaining(null, 0, false);
    expect(d.remainingMs).toBeNull();
    expect(d.seconds).toBeNull();
    expect(d.warn).toBe(false);
  });

  it("rounds seconds up and reports the fraction of the phase left", () => {
    const d = describeRemaining(12_100, 30_000, false);
    expect(d.seconds).toBe(13);
    expect(d.fraction).toBeCloseTo(0.4033, 3);
    expect(d.warn).toBe(false);
  });

  it("warns in the last 5 seconds, not at exactly zero and not while paused", () => {
    expect(describeRemaining(5000, 30_000, false).warn).toBe(true);
    expect(describeRemaining(5001, 30_000, false).warn).toBe(false);
    expect(describeRemaining(0, 30_000, false)).toMatchObject({ warn: false, done: true, seconds: 0 });
    expect(describeRemaining(3000, 30_000, true).warn).toBe(false);
  });

  it("clamps overshoot", () => {
    expect(describeRemaining(-400, 30_000, false)).toMatchObject({ remainingMs: 0, done: true });
    expect(describeRemaining(40_000, 30_000, false).fraction).toBe(1);
  });
});
