// STUB (owner: W1-engine agent). Keep these exports when implementing.
import type { PublicState } from "../realtime/types";
/** Build the PublicState for a room from the database. */
export async function buildPublicState(_roomId: string): Promise<PublicState> {
  throw new Error("buildPublicState not implemented");
}
/** Ideas/players changed: stats get re-published (coalesced, ≤ every 2 s). */
export function markStatsDirty(_roomId: string): void {}
/** A vote changed: tally gets re-published (coalesced, ≤ 2/s). */
export function markTallyDirty(_roomId: string): void {}
