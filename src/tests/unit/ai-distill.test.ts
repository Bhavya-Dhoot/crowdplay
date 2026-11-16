import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ingest/filter", () => {
  const blocked = /\b(badword|nastything)\b/i;
  return {
    checkText: (text: string, opts: { maxLen?: number; strict?: boolean } = {}) => {
      const t = text.replace(/\s+/g, " ").trim();
      if (!t) return { ok: false, reason: "EMPTY" };
      if (t.length > (opts.maxLen ?? 10_000)) return { ok: false, reason: "TOO_LONG" };
      if (blocked.test(t) || (opts.strict && /\bstrictonly\b/i.test(t))) return { ok: false, reason: "BLOCKED" };
      return { ok: true, text: t };
    },
    isClean: () => true,
  };
});

import { similarityRatio } from "@/lib/ai/cluster";
import { distillRound } from "@/lib/ai/distill";
import { cleanIdeaLabel, labelFor } from "@/lib/ai/heuristics";
import type { DistillIdea, DistillInput, DistillResult } from "@/lib/ai/types";
import { cannedIdeas } from "@/lib/bots/canned";
import { PRESETS } from "@/lib/presets";

function shuffle<T>(xs: T[]): T[] {
  // Deterministic interleave so arrival order is not bucket order.
  return [...xs].sort((a, b) => (hash(String(a)) % 997) - (hash(String(b)) % 997));
}
function hash(s: string): number {
  let h = 7;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

const mk = (lines: string[], user = (i: number) => `u${i % 50}`): DistillIdea[] =>
  lines.map((text, i) => ({ id: `idea${i}`, userId: user(i), text, createdAt: 1000 + i }));

const input = (ideas: DistillIdea[], extra: Partial<DistillInput> = {}): DistillInput => ({
  roomId: "room1",
  roundNo: 1,
  story: { premise: "A heist.", preset: "heist", summary: "", lastNarrations: [], roundNo: 1, roundsTotal: 3, lang: "en" },
  prompt: { title: PRESETS.heist.round1.title, text: PRESETS.heist.round1.text },
  narratorOptions: PRESETS.heist.round1.narratorOptions,
  ideas,
  ...extra,
});

const crowdLines = shuffle(cannedIdeas("heist"));

function expectBallotShape(r: DistillResult, ideas: DistillIdea[]) {
  expect(r.options).toHaveLength(3);
  const ids = new Set(ideas.map((i) => i.id));
  for (const o of r.options) {
    expect(o.label.length).toBeGreaterThanOrEqual(8);
    expect(o.label.length).toBeLessThanOrEqual(70);
    for (const id of o.sourceIdeaIds) expect(ids.has(id)).toBe(true);
  }
  expect(r.backups.length).toBeLessThanOrEqual(3);
  const labels = [...r.options, ...r.backups].map((o) => o.label);
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) expect(similarityRatio(labels[i], labels[j])).toBeLessThan(0.8);
  }
  // No idea backs two options.
  const seen = new Set<string>();
  for (const o of r.options) {
    for (const id of o.sourceIdeaIds) {
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  }
}

describe("distillRound (LLM_MODE=mock)", () => {
  const ideas = mk(crowdLines);
  it("returns two crowd options from the biggest clusters and one small wildcard", async () => {
    const r = await distillRound(input(ideas));
    expect(r.provider).toBe("mock");
    expect(r.fallbackUsed).toBe(false);
    expect(r.options.map((o) => o.kind)).toEqual(["crowd", "crowd", "wildcard"]);
    expectBallotShape(r, ideas);

    // Source ideas come from whole clusters: one cluster id per option, recorded in clusterOf.
    const clusterIdsOf = (i: number) => new Set(r.options[i].sourceIdeaIds.map((id) => r.clusterOf[id]));
    for (const i of [0, 1, 2]) expect(clusterIdsOf(i).size).toBe(1);
    const sizeOf = (cid: number) => Object.values(r.clusterOf).filter((c) => c === cid).length;
    const [a, b, w] = [0, 1, 2].map((i) => [...clusterIdsOf(i)][0]);
    expect(new Set([a, b, w]).size).toBe(3);
    expect(sizeOf(a)).toBeGreaterThan(sizeOf(w));
    expect(sizeOf(b)).toBeGreaterThan(sizeOf(w));
    expect(sizeOf(w) / ideas.length).toBeLessThanOrEqual(0.15);
    expect(Object.keys(r.clusterOf)).toHaveLength(ideas.length);
  });

  it("is deterministic", async () => {
    const a = await distillRound(input(ideas));
    const b = await distillRound(input(ideas));
    expect({ ...a, ms: 0 }).toEqual({ ...b, ms: 0 });
  });

  it("clusters about a thousand ideas well inside the 0.2 s cluster-and-candidates budget order of magnitude", async () => {
    const many = mk(Array.from({ length: 1000 }, (_, i) => crowdLines[i % crowdLines.length] + (i >= crowdLines.length ? ` v${i}` : "")));
    const t0 = performance.now();
    const r = await distillRound(input(many));
    expect(performance.now() - t0).toBeLessThan(1500);
    expectBallotShape(r, many);
  });

  it("uses three narrator options when nobody wrote anything (FR-16, B3)", async () => {
    const r = await distillRound(input([]));
    expect(r.options.map((o) => o.kind)).toEqual(["narrator", "narrator", "narrator"]);
    expect(r.options.map((o) => o.label)).toEqual([...PRESETS.heist.round1.narratorOptions]);
    for (const o of r.options) expect(o.sourceIdeaIds).toEqual([]);
    expect(r.backups).toEqual([]);
    expect(r.unsafeIdeaIds).toEqual([]);
    expect(r.fallbackUsed).toBe(false);
  });

  it("uses the single idea and fills the rest with narrator options (FR-16)", async () => {
    const one = mk(["sneak in through the air vents lol"]);
    const r = await distillRound(input(one));
    expect(r.options.map((o) => o.kind)).toEqual(["crowd", "narrator", "narrator"]);
    expect(r.options[0].label).toBe("Sneak in through the air vents");
    expect(r.options[0].sourceIdeaIds).toEqual(["idea0"]);
    expect(r.options[1].label).toBe(PRESETS.heist.round1.narratorOptions[0]);
    expect(r.options[2].label).toBe(PRESETS.heist.round1.narratorOptions[1]);
  });

  it("uses both ideas and fills the last slot with a narrator option (FR-16)", async () => {
    const two = mk(["sneak in through the air vents", "throw a surprise party for the guards"]);
    const r = await distillRound(input(two));
    expect(r.options.map((o) => o.kind)).toEqual(["crowd", "crowd", "narrator"]);
    expect(new Set(r.options.slice(0, 2).flatMap((o) => o.sourceIdeaIds))).toEqual(new Set(["idea0", "idea1"]));
    expect(r.options[2].sourceIdeaIds).toEqual([]);
  });

  it("two near-identical ideas are one cluster: one crowd option, two narrator options", async () => {
    const r = await distillRound(input(mk(["sneak in through the air vents", "sneak in through the air vents!!"])));
    expect(r.options.map((o) => o.kind)).toEqual(["crowd", "narrator", "narrator"]);
    expect(r.options[0].sourceIdeaIds).toHaveLength(2);
  });

  it("never lets a blocked word reach a label, a source list or the backups (C1)", async () => {
    const dirty = Array.from({ length: 30 }, (_, i) => `badword the guards number ${i}`);
    const mixed = mk(shuffle([...crowdLines.slice(0, 120), ...dirty]));
    const r = await distillRound(input(mixed));
    expect(JSON.stringify(r.options.concat(r.backups).map((o) => o.label)).toLowerCase()).not.toContain("badword");
    const dirtyIds = mixed.filter((i) => /badword/.test(i.text)).map((i) => i.id);
    expect(dirtyIds).toHaveLength(30);
    expect(new Set(r.unsafeIdeaIds)).toEqual(new Set(dirtyIds));
    for (const o of r.options.concat(r.backups)) for (const id of o.sourceIdeaIds) expect(dirtyIds).not.toContain(id);
    for (const id of dirtyIds) expect(r.clusterOf[id]).toBeUndefined();
  });

  it("flags a cluster that only fails the strict filter as unsafe and keeps it off the ballot", async () => {
    const edgy = Array.from({ length: 12 }, (_, i) => `strictonly lantern parade number ${i}`);
    const mixed = mk(shuffle([...crowdLines.slice(0, 100), ...edgy]));
    const r = await distillRound(input(mixed));
    const edgyIds = mixed.filter((i) => /strictonly/.test(i.text)).map((i) => i.id);
    for (const id of edgyIds) expect(r.unsafeIdeaIds).toContain(id);
    for (const o of r.options) expect(o.label.toLowerCase()).not.toContain("strictonly");
    for (const o of r.options) for (const id of o.sourceIdeaIds) expect(edgyIds).not.toContain(id);
  });

  it("Judge Mode boost: the judge's small cluster becomes the boosted wildcard", async () => {
    const judge: DistillIdea = { id: "judge1", userId: "judge", text: "make the pigeon our getaway driver", createdAt: 5000 };
    const withJudge = [...mk(crowdLines), judge];
    const r = await distillRound(input(withJudge, { boostUserId: "judge" }));
    expect(r.options[2].kind).toBe("wildcard");
    expect(r.options[2].boosted).toBe(true);
    expect(r.options[2].sourceIdeaIds).toContain("judge1");
    expect(r.options[2].label.toLowerCase()).toContain("pigeon");
    expect(r.options[0].boosted).toBeUndefined();
    expect(r.options[1].boosted).toBeUndefined();

    const plain = await distillRound(input(withJudge));
    expect(plain.options.some((o) => o.boosted)).toBe(false);
  });

  it("boost also applies on the heuristic-only path", async () => {
    const judge: DistillIdea = { id: "judge1", userId: "judge", text: "make the pigeon our getaway driver", createdAt: 5000 };
    const r = await distillRound(input([...mk(crowdLines), judge], { boostUserId: "judge", heuristicOnly: true }));
    expect(r.provider).toBe("heuristic");
    expect(r.options[2].boosted).toBe(true);
    expect(r.options[2].sourceIdeaIds).toContain("judge1");
  });

  it("does not boost when the judge's idea sits inside a big crowd cluster", async () => {
    const judge: DistillIdea = { id: "judge1", userId: "judge", text: "sneak in through the air vents", createdAt: 5000 };
    const r = await distillRound(input([...mk(crowdLines), judge], { boostUserId: "judge" }));
    expect(r.options.some((o) => o.boosted)).toBe(false);
  });

  it("re-roll never repeats an excluded label", async () => {
    const first = await distillRound(input(mk(crowdLines)));
    const excluded = first.options.map((o) => o.label);
    const second = await distillRound(input(mk(crowdLines), { excludeLabels: excluded }));
    expectBallotShape(second, mk(crowdLines));
    for (const o of second.options) for (const e of excluded) expect(similarityRatio(o.label, e)).toBeLessThan(0.8);
  });

  it("heuristicOnly returns cleaned representatives of the two largest clusters plus a small one", async () => {
    const all = mk(crowdLines);
    const r = await distillRound(input(all, { heuristicOnly: true }));
    expect(r.provider).toBe("heuristic");
    expect(r.fallbackUsed).toBe(true);
    expect(r.options.map((o) => o.kind)).toEqual(["crowd", "crowd", "wildcard"]);
    expectBallotShape(r, all);
    const sizes = new Map<number, number>();
    for (const c of Object.values(r.clusterOf)) sizes.set(c, (sizes.get(c) ?? 0) + 1);
    const ranked = [...sizes.entries()].sort((x, y) => y[1] - x[1]).map(([c]) => c);
    const cidOf = (i: number) => r.clusterOf[r.options[i].sourceIdeaIds[0]];
    expect([cidOf(0), cidOf(1)].sort()).toEqual([ranked[0], ranked[1]].sort());
    expect(sizes.get(cidOf(2))! / all.length).toBeLessThanOrEqual(0.15);
    for (const o of r.options) expect(o.label).not.toMatch(/\b(lol|imo|haha)\b/i);
  });

  it("ignores ideas that are empty after filtering without blocking them", async () => {
    const r = await distillRound(input(mk(["   ", "sneak in through the air vents"])));
    expect(r.unsafeIdeaIds).toEqual([]);
    expect(r.options[0].sourceIdeaIds).toEqual(["idea1"]);
  });
});

describe("heuristic labels", () => {
  it("cleans filler, casing and trailing chatter", () => {
    expect(cleanIdeaLabel("ok so we should sneak in through the air vents lol!!")).toBe("Sneak in through the air vents");
    expect(cleanIdeaLabel("what if the diamond is secretly a very expensive ice cube?")).toBe("The diamond is secretly a very expensive ice cube");
    expect(cleanIdeaLabel("run")).toBeNull();
    expect(cleanIdeaLabel("badword everywhere in the hall")).toBeNull();
    const long = cleanIdeaLabel("we should sneak in through the air vents and then crawl along the pipes until we find the vault door")!;
    expect(long.length).toBeLessThanOrEqual(70);
    expect(long.endsWith(" ")).toBe(false);
  });

  it("prefers a representative without a one-off misspelling", () => {
    const reps = [
      "tell the gurads it is a surprise inspection",
      "tell the guards it is a surprise inspection",
      "tell the guards it is a surprise inspection haha",
      "lets tell the guards it is a surprise inspection",
    ].map((text, i) => ({ id: `r${i}`, text }));
    expect(labelFor({ id: 0, size: 4, share: 0.04, reps }, [])).toBe("Tell the guards it is a surprise inspection");
  });
});
