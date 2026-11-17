// Which letter (A, B or C) each revealed round's winning option had on the ballot. The StoryRes contract carries the
// winner's label and kind but not its slot, so the story page reads the slot itself. Never throws: with no slot the
// page simply shows the line without a letter.
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { log } from "@/lib/log";

export type Slot = "A" | "B" | "C";

export async function loadWinnerSlots(showId: string): Promise<Map<number, Slot>> {
  const out = new Map<number, Slot>();
  try {
    const db = await getDb();
    const rows = await db
      .select({ roundNo: schema.rounds.roundNo, slot: schema.options.slot })
      .from(schema.rounds)
      .innerJoin(schema.options, eq(schema.options.id, schema.rounds.winnerOptionId))
      .where(eq(schema.rounds.showId, showId));
    for (const r of rows) if (r.slot === "A" || r.slot === "B" || r.slot === "C") out.set(r.roundNo, r.slot);
  } catch (err) {
    log.warn({ err, showId }, "story: winner letters unavailable, showing the lines without them");
  }
  return out;
}
