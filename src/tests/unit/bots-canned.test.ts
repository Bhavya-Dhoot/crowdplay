import { describe, expect, it } from "vitest";
import { cleanIdeaLabel } from "@/lib/ai/heuristics";
import { cannedIdeas } from "@/lib/bots/canned";
import { PRESET_IDS } from "@/lib/api/contracts";

// A bot line can end up as a ballot option or on the winner card (the label cleaner turns the line into a label), so
// every line of every preset must clean into something that reads as the crowd's idea: no stray opener, no misspelling.
describe.each(PRESET_IDS)("canned bot ideas as ballot labels (%s)", (preset) => {
  const lines = cannedIdeas(preset);

  it("never leave an opener such as 'we', 'maybe' or 'just' on the label", () => {
    const stray = lines.map((l) => cleanIdeaLabel(l)).filter((l): l is string => l !== null && /^(we|i|maybe|just|ok|lets|so) /i.test(l));
    expect(stray).toEqual([]);
  });

  it("are not misspelled on purpose: a doubled-up swap of two neighbouring letters never appears", () => {
    // The old pool swapped two neighbouring letters of one word in ~11% of lines. The cores are spelled correctly, so a
    // word that occurs in exactly one line and is not a core word of its preset would be such a swap.
    const core = new Set(lines.flatMap((l) => l.toLowerCase().match(/[a-z]{5,}/g) ?? []));
    const count = new Map<string, number>();
    for (const l of lines) for (const w of new Set(l.toLowerCase().match(/[a-z]{5,}/g) ?? [])) count.set(w, (count.get(w) ?? 0) + 1);
    // Every long word appears in at least the line's own four variants, so a one-line word means a variant was mangled.
    const lone = [...count.entries()].filter(([w, n]) => n < 2 && core.has(w));
    expect(lone.map(([w]) => w)).toEqual([]);
  });
});
