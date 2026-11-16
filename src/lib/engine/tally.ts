// Vote counting and winner selection (FR-18..FR-20). pickWinner is pure; loadTally reads the votes table.
import { and, eq, inArray, sql } from "drizzle-orm";
import { schema, type Db } from "../db/client";
import type { OptionSlot } from "../realtime/types";

const SLOT_ORDER: Record<OptionSlot, number> = { A: 0, B: 1, C: 2 };

export type TallyOption = {
  id: string;
  slot: OptionSlot;
  /** Epoch ms of the earliest supporting idea; null for narrator options (they sort last). */
  firstIdeaAt: number | null;
};

export type WinnerPick = {
  winnerId: string | null;
  reason: "forced" | "majority" | "tiebreak" | "none";
  /** Options that shared the top count (reason "tiebreak"). */
  tied: string[];
};

/** FR-20: earliest first supporting idea wins; no supporting idea sorts last; then slot order. */
export function compareTie(a: TallyOption, b: TallyOption): number {
  const ta = a.firstIdeaAt ?? Number.POSITIVE_INFINITY;
  const tb = b.firstIdeaAt ?? Number.POSITIVE_INFINITY;
  if (ta !== tb) return ta < tb ? -1 : 1;
  return SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot];
}

/** Forced (when it is a live option) > highest tally > FR-20 tie-break. */
export function pickWinner(options: TallyOption[], counts: Record<string, number>, forcedId: string | null): WinnerPick {
  if (options.length === 0) return { winnerId: null, reason: "none", tied: [] };
  if (forcedId && options.some((o) => o.id === forcedId)) return { winnerId: forcedId, reason: "forced", tied: [] };
  const top = Math.max(...options.map((o) => counts[o.id] ?? 0));
  const tied = options.filter((o) => (counts[o.id] ?? 0) === top);
  if (tied.length === 1) return { winnerId: tied[0].id, reason: "majority", tied: [] };
  const ordered = [...tied].sort(compareTie);
  return { winnerId: ordered[0].id, reason: "tiebreak", tied: ordered.map((o) => o.id) };
}

/** optionId -> votes for the given options (zero-filled) and the total across them. */
export async function loadTally(db: Db, roundId: string, optionIds: string[]): Promise<{ tally: Record<string, number>; total: number }> {
  const tally: Record<string, number> = Object.fromEntries(optionIds.map((id) => [id, 0]));
  if (optionIds.length === 0) return { tally, total: 0 };
  const rows = await db
    .select({ optionId: schema.votes.optionId, n: sql<number>`count(*)::int` })
    .from(schema.votes)
    .where(and(eq(schema.votes.roundId, roundId), inArray(schema.votes.optionId, optionIds)))
    .groupBy(schema.votes.optionId);
  let total = 0;
  for (const r of rows) {
    tally[r.optionId] = r.n;
    total += r.n;
  }
  return { tally, total };
}
