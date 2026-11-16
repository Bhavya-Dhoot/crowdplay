// POST /api/try: a private demo room with 30 labelled bots that starts itself (UX_SPEC §3.6, PRD J1).
// The judge is the room's creator but never receives the host key, so nobody can steer the show.
import { eq } from "drizzle-orm";
import { TryBody, type TryRes } from "@/lib/api/contracts";
import { requireUser } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db/client";
import { advance } from "@/lib/engine/advance";
import { AppError, handle, json } from "@/lib/errors";
import { checkText } from "@/lib/ingest/filter";
import { ensureBots } from "@/lib/bots/runner";
import { PRESETS } from "@/lib/presets";
import { createRoom, joinRoom } from "@/lib/rooms";

export const dynamic = "force-dynamic";

const DEMO_ROUNDS = 3;
const DEMO_STORM_MS = 20_000;
const DEMO_VOTE_MS = 12_000;

// Simple in-process token buckets: a few demos at once per person, a looser cap per network (a demo room
// is cheap for us but it runs bots and timers for about three minutes).
type Bucket = { tokens: number; at: number };
const USER_LIMIT = { capacity: 5, refillMs: 20_000 };
const IP_LIMIT = { capacity: 20, refillMs: 6_000 };
const g = globalThis as unknown as { __cpTryBuckets?: Map<string, Bucket> };

function take(key: string, spec: { capacity: number; refillMs: number }, now: number, commit: boolean): number {
  const map = (g.__cpTryBuckets ??= new Map());
  const b = map.get(key) ?? { tokens: spec.capacity, at: now };
  const tokens = Math.min(spec.capacity, b.tokens + Math.max(0, now - b.at) / spec.refillMs);
  if (tokens < 1) return Math.ceil((1 - tokens) * spec.refillMs);
  if (commit) map.set(key, { tokens: tokens - 1, at: now });
  return 0;
}

/** 0 = allowed (a token is taken from both buckets), otherwise milliseconds until the slowest bucket refills. */
function demoLimit(userId: string, ip: string): number {
  const now = Date.now();
  const wait = Math.max(take(`u:${userId}`, USER_LIMIT, now, false), take(`ip:${ip}`, IP_LIMIT, now, false));
  if (wait > 0) return wait;
  take(`u:${userId}`, USER_LIMIT, now, true);
  take(`ip:${ip}`, IP_LIMIT, now, true);
  return 0;
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req.headers.get("x-real-ip") || "local";
}

export async function POST(req: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser(req);
    const body = TryBody.parse(await req.json().catch(() => ({})));

    const wait = demoLimit(user.id, clientIp(req));
    if (wait > 0) {
      throw new AppError("DEMO_LIMIT", `That's a lot of demos! Give it ${Math.max(1, Math.ceil(wait / 1000))} seconds and try again.`, 429);
    }

    let me = user;
    if (body.displayName && body.displayName !== user.displayName) {
      const name = checkText(body.displayName, { strict: true, maxLen: 20 });
      if (!name.ok) throw new AppError("NAME_BLOCKED", "That name won't work here. Try a different one.", 400);
      const db = await getDb();
      await db.update(schema.users).set({ displayName: name.text }).where(eq(schema.users.id, user.id));
      me = { ...user, displayName: name.text };
    }

    const preset = PRESETS.heist;
    const { room, show } = await createRoom(
      {
        title: "Demo show",
        preset: preset.id,
        premise: preset.premise,
        roundsTotal: DEMO_ROUNDS,
        stormMs: DEMO_STORM_MS,
        voteMs: DEMO_VOTE_MS,
        autoAdvance: true,
        strictFilter: true,
      },
      me,
      { isDemo: true, demoUserId: me.id },
    );
    await ensureBots(room.id); // before the judge, so a name that clashes with a bot's renames the human
    await joinRoom(room, me);
    await advance(room.id, { type: "HOST_START" });
    return json({ ok: true, code: room.code, showId: show.id } satisfies TryRes);
  });
}
