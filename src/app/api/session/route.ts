import { eq } from "drizzle-orm";
import { SessionBody, type SessionRes } from "@/lib/api/contracts";
import { clearSessionCookie, optionalUser, requireUser, sessionCookie, signSession } from "@/lib/auth/session";
import { env, features } from "@/lib/config";
import { getDb, schema } from "@/lib/db/client";
import { markStatsDirty, markTallyDirty } from "@/lib/engine/publish";
import { handle, AppError } from "@/lib/errors";
import { newUserId } from "@/lib/ids";
import { checkText } from "@/lib/ingest/filter";
import { log } from "@/lib/log";
import { getRealtimeServer } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const ENSURE_USER_TIMEOUT_MS = 3000;

/** The provider token, or undefined when the provider is slow/down: the client then falls back to HTTP. */
async function realtimeToken(user: { id: string; name: string }): Promise<string | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("ensureUser timed out")), ENSURE_USER_TIMEOUT_MS);
    });
    const { token } = await Promise.race([getRealtimeServer().ensureUser(user), timeout]);
    return token;
  } catch (err) {
    log.warn({ err, userId: user.id }, "ensureUser failed; session continues without a realtime token");
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: Request): Promise<Response> {
  return handle(async () => {
    const body = SessionBody.parse(await req.json().catch(() => null));
    const name = checkText(body.displayName, { strict: true, maxLen: 20 });
    if (!name.ok) throw new AppError("NAME_BLOCKED", "That name won't work here. Try a different one.", 400);

    const db = await getDb();
    // A valid session keeps its user (so ideas, votes and receipts stay together); only the name changes.
    const existing = await optionalUser(req);
    let userId: string;
    if (existing && !existing.isBot) {
      userId = existing.id;
      if (existing.displayName !== name.text) {
        await db.update(schema.users).set({ displayName: name.text }).where(eq(schema.users.id, userId));
      }
    } else {
      userId = newUserId();
      await db.insert(schema.users).values({ id: userId, displayName: name.text });
    }

    const token = await realtimeToken({ id: userId, name: name.text });
    const e = env();
    if (token && getRealtimeServer().kind === "nexconn") {
      await db.update(schema.users).set({ nexconnUserId: userId }).where(eq(schema.users.id, userId));
    }

    const sessionToken = await signSession(userId);
    const res: SessionRes = {
      ok: true,
      user: { id: userId, displayName: name.text },
      sessionToken,
      realtime: {
        mode: e.REALTIME_MODE,
        ingest: e.INGEST_MODE,
        appKey: e.NEXT_PUBLIC_NEXCONN_APP_KEY,
        token,
        area: e.NEXT_PUBLIC_NEXCONN_AREA,
      },
      features: features(),
    };
    return Response.json(res, { headers: { "Set-Cookie": sessionCookie(sessionToken) } });
  });
}

/** "Delete my data": votes, receipts and participation go; ideas are blanked; the account is anonymised. */
export async function DELETE(req: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser(req);
    const db = await getDb();

    const rooms = await db
      .select({ roomId: schema.participants.roomId })
      .from(schema.participants)
      .where(eq(schema.participants.userId, user.id));
    const roomIds = [...new Set(rooms.map((r) => r.roomId))];

    await db.transaction(async (tx) => {
      await tx.delete(schema.receipts).where(eq(schema.receipts.userId, user.id));
      await tx.delete(schema.votes).where(eq(schema.votes.userId, user.id));
      await tx.delete(schema.participants).where(eq(schema.participants.userId, user.id));
      await tx.update(schema.ideas).set({ status: "deleted", text: "" }).where(eq(schema.ideas.userId, user.id));
      await tx
        .update(schema.users)
        .set({ deletedAt: new Date(), displayName: "Former player" })
        .where(eq(schema.users.id, user.id));
    });

    // Live rooms show vote tallies and idea counts: recompute them without this user.
    for (const roomId of roomIds) {
      markStatsDirty(roomId);
      markTallyDirty(roomId);
    }
    return Response.json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie() } });
  });
}
