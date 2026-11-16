import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ingest/filter", () => {
  const blocked = /\b(badword|nastything)\b/i;
  return {
    checkText: (text: string, opts: { maxLen?: number } = {}) => {
      const t = text.replace(/\s+/g, " ").trim();
      if (!t) return { ok: false, reason: "EMPTY" };
      if (t.length > (opts.maxLen ?? 10_000)) return { ok: false, reason: "TOO_LONG" };
      if (blocked.test(t)) return { ok: false, reason: "BLOCKED" };
      return { ok: true, text: t };
    },
    isClean: () => true,
  };
});

import { validateDistill, type ValidateCtx } from "@/lib/ai/distill";

// 100 clustered ideas: two big crowd clusters, then small ones.
const sizes = new Map<number, number>([
  [0, 40],
  [1, 30],
  [2, 12],
  [3, 8],
  [4, 5],
  [5, 3],
  [6, 2],
]);
const ctx: ValidateCtx = { sizes, crowdIds: new Set([0, 1, 2, 3]), totalIdeas: 100, excludeLabels: [] };

type Opt = { label: string; kind: "crowd" | "wildcard"; sourceClusterIds: number[] };
const good = {
  options: [
    { label: "The crew sneaks in through the air vents", kind: "crowd", sourceClusterIds: [0] },
    { label: "A loud distraction empties the lobby", kind: "crowd", sourceClusterIds: [1] },
    { label: "The guard dog turns out to be the mastermind", kind: "wildcard", sourceClusterIds: [4] },
  ] as Opt[],
  backups: [] as Opt[],
  unsafeClusterIds: [] as number[],
};
const mutate = (fn: (o: typeof good) => void) => {
  const copy = structuredClone(good);
  fn(copy);
  return copy;
};

describe("validateDistill", () => {
  it("accepts a well-formed answer and returns cleaned options", () => {
    const r = validateDistill(good, ctx);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.options.map((o) => o.kind)).toEqual(["crowd", "crowd", "wildcard"]);
      expect(r.value.options[2].clusterIds).toEqual([4]);
    }
  });

  it("accepts the smallest cluster as wildcard even when it exceeds 15%", () => {
    const sz = new Map<number, number>([
      [0, 40],
      [1, 35],
      [2, 25],
    ]);
    const r = validateDistill(
      mutate((o) => (o.options[2].sourceClusterIds = [2])),
      { sizes: sz, crowdIds: new Set([0, 1, 2]), totalIdeas: 100, excludeLabels: [] },
    );
    expect(r.ok).toBe(true);
  });

  const bad: [string, (o: typeof good) => void, RegExp][] = [
    ["crowd slot with wrong kind", (o) => (o.options[1].kind = "wildcard"), /options\[1\]\.kind/],
    ["wildcard slot with crowd kind", (o) => (o.options[2].kind = "crowd"), /options\[2\]\.kind/],
    ["unknown cluster id", (o) => (o.options[0].sourceClusterIds = [99]), /unknown cluster 99/],
    ["same cluster in two options", (o) => (o.options[2].sourceClusterIds = [0]), /more than one option/],
    [
      "wildcard from a big cluster",
      (o) => {
        o.options[1].sourceClusterIds = [2];
        o.options[2].sourceClusterIds = [1];
      },
      /too big/,
    ],
    ["crowd option from a non-crowd cluster", (o) => (o.options[0].sourceClusterIds = [5]), /not a crowd cluster/],
    ["label too short", (o) => (o.options[0].label = "Run"), /label/],
    ["label too long", (o) => (o.options[0].label = "x".repeat(71)), /label/],
    [
      "near-duplicate labels",
      (o) => (o.options[1].label = "The crew sneaks in through the air vent"),
      /too similar/,
    ],
    ["unsafe label", (o) => (o.options[2].label = "The guard shouts a badword at everyone"), /safe/],
    ["emoji in label", (o) => (o.options[0].label = "The crew sneaks in \u{1F600} through the vents"), /emoji/],
    ["question label", (o) => (o.options[0].label = "Does the crew sneak in through the vents?"), /question/],
    ["flagged-unsafe cluster used", (o) => (o.unsafeClusterIds = [4]), /flagged unsafe/],
    ["two options instead of three", (o) => o.options.pop(), /options/],
    ["no source clusters", (o) => (o.options[0].sourceClusterIds = []), /sourceClusterIds/],
  ];
  it.each(bad)("rejects: %s", (_name, fn, re) => {
    const r = validateDistill(mutate(fn), ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" | ")).toMatch(re);
  });

  it.each([null, "text", 42, {}, { options: "nope" }])("rejects non-conforming payload %j", (payload) => {
    expect(validateDistill(payload, ctx).ok).toBe(false);
  });

  it("rejects a label that repeats an excluded one (re-roll)", () => {
    const r = validateDistill(good, { ...ctx, excludeLabels: ["The crew sneaks in through the air vents!"] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/excluded/);
  });

  it("filters backups leniently and keeps only usable ones", () => {
    const r = validateDistill(
      mutate((o) => {
        o.backups = [
          { label: "A rival crew steps out of the elevator", kind: "crowd", sourceClusterIds: [2] },
          { label: "Reuses an option cluster entirely here", kind: "crowd", sourceClusterIds: [0] },
          { label: "A badword appears on the wall", kind: "wildcard", sourceClusterIds: [5] },
        ];
        o.unsafeClusterIds = [42];
      }),
      ctx,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.backups.map((b) => b.clusterIds[0])).toEqual([2]);
      expect(r.value.unsafeClusterIds).toEqual([]);
    }
    const r2 = validateDistill(
      mutate((o) => {
        o.backups = [
          { label: "Ghost cluster that does not exist", kind: "wildcard", sourceClusterIds: [42] },
          { label: "The vault hums a show tune quietly", kind: "wildcard", sourceClusterIds: [6] },
          { label: "The vault hums a show tune quietly!", kind: "wildcard", sourceClusterIds: [3] },
        ];
      }),
      ctx,
    );
    expect(r2.ok && r2.value.backups.map((b) => b.clusterIds[0])).toEqual([6]);
  });

  it("rejects more than three backups", () => {
    const r = validateDistill(
      mutate((o) => {
        o.backups = [2, 3, 5, 6].map((id) => ({ label: `Backup option number ${id} here`, kind: "crowd" as const, sourceClusterIds: [id] }));
      }),
      ctx,
    );
    expect(r.ok).toBe(false);
  });
});
