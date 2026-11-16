// STUB (owner: W1-ingest agent).
import type { IdeaRejectCode } from "../api/contracts";

export type IngestInput = {
  roomCode: string;
  userId: string;
  roundNo: number;
  text: string;
  clientMsgId: string;
  source: "webhook" | "post" | "bot";
  ip?: string | null;
};
export type IngestResult =
  | { ok: true; ideaId: string; duplicate: boolean }
  | { ok: false; code: IdeaRejectCode; message: string; retryInMs?: number };

export async function ingestIdea(_input: IngestInput): Promise<IngestResult> {
  throw new Error("ingestIdea not implemented");
}
