import { beforeEach, describe, expect, it } from "vitest";
import { limitCheer, limitIdea, resetRateLimits } from "@/lib/ingest/ratelimit";

const T0 = 1_000_000;

beforeEach(() => resetRateLimits());

describe("idea rate limit", () => {
  it("allows one idea, refuses the next immediately, with a retry hint", () => {
    expect(limitIdea("u_a", null, T0)).toEqual({ ok: true, retryInMs: 0 });
    const second = limitIdea("u_a", null, T0 + 10);
    expect(second.ok).toBe(false);
    expect(second.retryInMs).toBeGreaterThan(1700);
    expect(second.retryInMs).toBeLessThanOrEqual(2000);
  });

  it("refills one token per 2 s", () => {
    expect(limitIdea("u_a", null, T0).ok).toBe(true);
    expect(limitIdea("u_a", null, T0 + 1000).ok).toBe(false);
    expect(limitIdea("u_a", null, T0 + 2000).ok).toBe(true);
    expect(limitIdea("u_a", null, T0 + 2500).ok).toBe(false);
    expect(limitIdea("u_a", null, T0 + 4000).ok).toBe(true);
  });

  it("never banks more than one token while idle", () => {
    expect(limitIdea("u_a", null, T0).ok).toBe(true);
    expect(limitIdea("u_a", null, T0 + 60_000).ok).toBe(true);
    expect(limitIdea("u_a", null, T0 + 60_001).ok).toBe(false);
  });

  it("forgives arrival jitter but carries the debt, so the long-run rate stays 1 per 2 s", () => {
    expect(limitIdea("u_a", null, T0).ok).toBe(true);
    expect(limitIdea("u_a", null, T0 + 1880).ok).toBe(true); // client waited 2 s, the network shaved 120 ms
    expect(limitIdea("u_a", null, T0 + 1880 + 1000).ok).toBe(false);
    expect(limitIdea("u_a", null, T0 + 1880 + 2000).ok).toBe(true);
  });

  it("keeps users independent", () => {
    expect(limitIdea("u_a", null, T0).ok).toBe(true);
    expect(limitIdea("u_b", null, T0).ok).toBe(true);
    expect(limitIdea("u_a", null, T0).ok).toBe(false);
  });

  it("the IP bucket is loose enough for a room sharing one wifi", () => {
    // 30 different players behind one IP, each sending their first idea in the same instant.
    for (let i = 0; i < 30; i++) expect(limitIdea(`u_${i}`, "10.0.0.1", T0).ok).toBe(true);
  });

  it("the IP bucket still stops a flood from one address", () => {
    let refused = 0;
    for (let i = 0; i < 100; i++) if (!limitIdea(`u_${i}`, "10.0.0.2", T0).ok) refused++;
    expect(refused).toBeGreaterThan(0);
    expect(limitIdea("u_other", "10.0.0.3", T0).ok).toBe(true); // other addresses unaffected
  });

  it("a refusal by the IP bucket does not burn the user's own token", () => {
    for (let i = 0; i < 40; i++) limitIdea(`u_${i}`, "10.0.0.4", T0);
    expect(limitIdea("u_late", "10.0.0.4", T0).ok).toBe(false);
    // Same user, different address, same instant: still has their token.
    expect(limitIdea("u_late", "10.0.0.5", T0).ok).toBe(true);
  });

  it("retryInMs reports the slowest bucket", () => {
    for (let i = 0; i < 40; i++) limitIdea(`u_${i}`, "10.0.0.6", T0);
    const r = limitIdea("u_x", "10.0.0.6", T0);
    expect(r.ok).toBe(false);
    expect(r.retryInMs).toBeLessThanOrEqual(100);
    expect(r.retryInMs).toBeGreaterThan(0);
  });
});

describe("cheer rate limit", () => {
  it("is looser than ideas: a short burst passes, a flood does not", () => {
    for (let i = 0; i < 6; i++) expect(limitCheer("u_a", null, T0).ok).toBe(true);
    expect(limitCheer("u_a", null, T0).ok).toBe(false);
    expect(limitCheer("u_a", null, T0 + 500).ok).toBe(true);
  });

  it("does not share buckets with ideas", () => {
    expect(limitIdea("u_a", null, T0).ok).toBe(true);
    expect(limitCheer("u_a", null, T0).ok).toBe(true);
  });
});
