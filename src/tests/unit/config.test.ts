import { afterEach, describe, expect, it, vi } from "vitest";
import { assertBootable, defaultTimings, resetConfig } from "@/lib/config";
import { normalizeRoomCode, newRoomCode, ROOM_CODE_RE } from "@/lib/ids";

afterEach(() => {
  vi.unstubAllEnvs();
  resetConfig();
});

describe("config", () => {
  it("refuses production boot on the mock transport", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REALTIME_MODE", "mock");
    vi.stubEnv("SESSION_SECRET", "x".repeat(32));
    resetConfig();
    expect(() => assertBootable()).toThrow(/REALTIME_MODE=mock/);
  });

  it("allows mock in production only with ALLOW_MOCK_IN_PROD=1", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REALTIME_MODE", "mock");
    vi.stubEnv("ALLOW_MOCK_IN_PROD", "1");
    resetConfig();
    expect(() => assertBootable()).not.toThrow();
  });

  it("skips the guard during next build", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REALTIME_MODE", "mock");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    resetConfig();
    expect(() => assertBootable()).not.toThrow();
  });

  it("treats empty env values as unset and scales timings", () => {
    vi.stubEnv("STORM_MS", "");
    vi.stubEnv("TIMING_SCALE", "0.5");
    resetConfig();
    expect(defaultTimings().stormMs).toBe(15000);
  });
});

describe("ids", () => {
  it("room codes are 5 letters without O or I", () => {
    for (let i = 0; i < 500; i++) {
      const c = newRoomCode();
      expect(c).toMatch(ROOM_CODE_RE);
      expect(c).not.toMatch(/[OI01]/);
    }
  });
  it("normalizes user input", () => {
    expect(normalizeRoomCode("abc-de")).toBe("ABCDE");
    expect(normalizeRoomCode("ABCDO")).toBeNull();
    expect(normalizeRoomCode("ABCD")).toBeNull();
  });
});
