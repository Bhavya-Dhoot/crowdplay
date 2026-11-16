import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { IdeaBody } from "@/lib/api/contracts";
import { requireUser } from "@/lib/auth/session";
import { env, features } from "@/lib/config";
import { getDb, schema } from "@/lib/db/client";
import { AppError, handle } from "@/lib/errors";
import { limitCheer } from "@/lib/ingest/ratelimit";
import { processIncoming } from "@/lib/ingest/webhook";
import { log } from "@/lib/log";
import { assertMockMode, CLIENT_OBJECT_NAMES, mockBus } from "@/lib/realtime/mock.server";
import { OBJECT_NAMES } from "@/lib/realtime/types";

export const dynamic = "force-dynamic";

const SendBody = z.object({
  channelId: z.string().regex(/^cp_[A-Z]{5}$/),
  objectName: z.string().min(1).max(50),
  payload: z.unknown(),
});
const IdeaWire = IdeaBody.extend({ t: z.literal("idea") });
const CheerWire = z.object({ t: z.literal("cheer"), emoji: z.string().min(1).max(16) });

function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || null;
}

/**
 * Mock stand-in for "client sends a custom message into an Open Channel" (mock mode only).
 * Behaves like the provider: refuses muted/banned senders, fans out to everyone but the sender,
 * and (when INGEST_MODE uses the webhook) tells the server about it through the same webhook pipeline.
 */
export async function POST(req: Request): Promise<Response> {
  return handle(async () => {
    assertMockMode();
    const user = await requireUser(req);
    const { channelId, objectName, payload } = SendBody.parse(await req.json().catch(() => null));
    if (!CLIENT_OBJECT_NAMES.includes(objectName)) {
      throw new AppError("BAD_REQUEST", "Clients can only send ideas and cheers.", 400);
    }

    const db = await getDb();
    const [room] = await db
      .select({ id: schema.rooms.id })
      .from(schema.rooms)
      .where(eq(schema.rooms.channelId, channelId))
      .limit(1);
    if (!room) throw new AppError("ROOM_NOT_FOUND", "We couldn't find that room.", 404);

    const [p] = await db
      .select({ muted: schema.participants.muted, banned: schema.participants.banned })
      .from(schema.participants)
      .where(and(eq(schema.participants.roomId, room.id), eq(schema.participants.userId, user.id)))
      .limit(1);
    if (mockBus.isBanned(channelId, user.id) || p?.banned) {
      throw new AppError("BANNED", "You've been removed from this room.", 403);
    }
    if (mockBus.isMuted(channelId, user.id) || p?.muted) {
      throw new AppError("MUTED", "The host has muted you for now.", 403);
    }

    if (objectName === OBJECT_NAMES.cheer) {
      if (!features().cheers) throw new AppError("CHEERS_OFF", "Cheers are switched off.", 403);
      const cheer = CheerWire.parse(payload);
      const limit = limitCheer(user.id, clientIp(req));
      if (!limit.ok) {
        return Response.json(
          { ok: false, code: "RATE_LIMITED", message: "Easy on the cheers!", retryInMs: limit.retryInMs },
          { status: 429 },
        );
      }
      // Name and bot flag come from the account, not from the client.
      mockBus.broadcast(channelId, "cheer", { t: "cheer", emoji: cheer.emoji, name: user.displayName, isBot: false, userId: user.id }, user.id);
      return Response.json({ ok: true });
    }

    const idea = IdeaWire.parse(payload);
    mockBus.broadcast(
      channelId,
      "idea",
      { t: "idea", roundNo: idea.roundNo, text: idea.text, clientMsgId: idea.clientMsgId, name: user.displayName, isBot: false, userId: user.id },
      user.id,
    );

    const ingest = env().INGEST_MODE;
    if (ingest === "dual" || ingest === "webhook") {
      try {
        await processIncoming([
          {
            providerMsgId: `mock_${nanoid(16)}`,
            channelId,
            fromUserId: user.id,
            objectName,
            payload: idea,
            sentAt: Date.now(),
          },
        ]);
      } catch (err) {
        log.error({ err, channelId }, "mock webhook simulation failed");
      }
    }
    return Response.json({ ok: true });
  });
}
