// Provider webhook -> idea ingestion. The body is never trusted on its own: the adapter verifies the
// signature/timestamp, we dedupe by provider message id, and ingestIdea re-checks participant, phase,
// rate limits and the filter exactly as it does for the HTTP path.
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../db/client";
import { AppError } from "../errors";
import { log } from "../log";
import { getRealtimeServer } from "../realtime";
import { OBJECT_NAMES, type IncomingMessage } from "../realtime/types";
import { IdeaBody } from "../api/contracts";
import { ingestIdea } from "./ideas";

export type WebhookCounts = {
  received: number;
  ingested: number;
  /** Provider redeliveries and HTTP+webhook double deliveries. */
  duplicates: number;
  /** Failed validation, or refused by ingestIdea (wrong phase, blocked, rate limited, ...). */
  rejected: number;
  /** Not a CP:Idea in a CrowdPlay channel (cheers, state echoes, other apps). */
  ignored: number;
  /** Unexpected failures; the provider should retry these. */
  errors: number;
};

// Wire shape of CP:Idea (the sender is the provider's fromUserId, never a field in the body).
const IdeaWire = IdeaBody.extend({ t: z.literal("idea") });

function roomCodeOf(channelId: string): string | null {
  const m = /^cp_([A-Z]{5})$/.exec(channelId);
  return m ? m[1] : null;
}

function parsePayload(payload: unknown): unknown {
  if (typeof payload !== "string") return payload;
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

/** Run verified provider messages through dedupe + ingestion. Also used by the mock transport's simulated webhook. */
export async function processIncoming(messages: IncomingMessage[]): Promise<WebhookCounts> {
  const db = await getDb();
  const counts: WebhookCounts = { received: messages.length, ingested: 0, duplicates: 0, rejected: 0, ignored: 0, errors: 0 };

  for (const msg of messages) {
    const roomCode = roomCodeOf(msg.channelId);
    if (msg.objectName !== OBJECT_NAMES.idea || !roomCode) {
      counts.ignored++;
      continue;
    }

    // Claim the provider message id first; a replay finds the row and stops here.
    const claimed = await db
      .insert(schema.webhookEvents)
      .values({ id: msg.providerMsgId })
      .onConflictDoNothing()
      .returning({ id: schema.webhookEvents.id });
    if (claimed.length === 0) {
      counts.duplicates++;
      continue;
    }

    const parsed = IdeaWire.safeParse(parsePayload(msg.payload));
    if (!parsed.success) {
      counts.rejected++;
      continue;
    }

    try {
      const res = await ingestIdea({
        roomCode,
        userId: msg.fromUserId,
        roundNo: parsed.data.roundNo,
        text: parsed.data.text,
        clientMsgId: parsed.data.clientMsgId,
        source: "webhook",
      });
      if (!res.ok) counts.rejected++;
      else if (res.duplicate) counts.duplicates++;
      else counts.ingested++;
    } catch (err) {
      if (err instanceof AppError) {
        counts.rejected++; // e.g. unknown room: retrying will not help
        continue;
      }
      // Release the claim so the provider's retry is processed instead of skipped as a replay.
      counts.errors++;
      log.error({ err, roomCode, providerMsgId: msg.providerMsgId }, "webhook ingest failed");
      await db.delete(schema.webhookEvents).where(eq(schema.webhookEvents.id, msg.providerMsgId)).catch(() => {});
    }
  }
  return counts;
}

export async function handleWebhook(req: Request): Promise<Response> {
  const raw = await req.text();
  const messages = await getRealtimeServer().verifyWebhook(req, raw);
  if (!messages) {
    log.warn("webhook rejected: bad signature, stale timestamp or unparseable body");
    return Response.json({ ok: false, code: "BAD_SIGNATURE", message: "Invalid webhook signature." }, { status: 401 });
  }
  const counts = await processIncoming(messages);
  // 500 only for unexpected failures, so the provider retries them (their claims were released).
  return Response.json({ ok: counts.errors === 0, ...counts }, { status: counts.errors > 0 ? 500 : 200 });
}
