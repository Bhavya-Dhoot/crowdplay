// Rooms service: creation, joining, voting, host actions and the host feed. Route handlers stay thin and call these.
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { fallbackPrompt } from "./ai/prompts";
import type {
  CreateRoomInput,
  HostActionInput,
  HostFeedIdea,
  HostFeedPlayer,
  HostFeedRes,
  HostMetrics,
  MeInRoom,
  RoomInfoRes,
  RoomLinks,
} from "./api/contracts";
import { hashHostKey } from "./auth/hostKey";
import type { SessionUser } from "./auth/session";
import { DEMO } from "./bots/demo";
import { defaultTimings, env, scaled } from "./config";
import { getDb, schema, type Db } from "./db/client";
import { advance, advanceIfDue, engineNow, loadEngineState } from "./engine/advance";
import { LAST_RESORT_SCENE } from "./engine/effects";
import { withRoomLock } from "./engine/lock";
import { buildPublicState, liveOptions, markStatsDirty, markTallyDirty, withTimeout } from "./engine/publish";
import type { Trigger } from "./engine/types";
import { AppError } from "./errors";
import { newHostKey, newId, newRoomCode, normalizeRoomCode } from "./ids";
import { log } from "./log";
import { PRESETS } from "./presets";
import { getRealtimeServer } from "./realtime/index";
import { NARRATOR_USER_ID, channelIdForRoom, type PublicState, type RoomMessage } from "./realtime/types";

export type RoomRow = typeof schema.rooms.$inferSelect;
export type ShowRow = typeof schema.shows.$inferSelect;

const ENSURE_CHANNEL_TIMEOUT_MS = 5000;
const REALTIME_CALL_TIMEOUT_MS = 3000;
const SEEN_WINDOW_MS = 45_000;
const FEED_IDEA_LIMIT = 300;
const TOUCH_EVERY_MS = 15_000;

export function roomLinks(code: string, hostKey: string): RoomLinks {
  const base = env().APP_URL.replace(/\/+$/, "");
  return {
    join: `${base}/join/${code}`,
    play: `${base}/play/${code}`,
    screen: `${base}/screen/${code}`,
    obs: `${base}/screen/${code}?obs=1`,
    host: `${base}/host/${code}?k=${encodeURIComponent(hostKey)}`,
  };
}

// ---------- creation ----------

type Scene = { title: string; text: string; narratorOptions: [string, string, string]; provider: string };

/** Round 1 is hand-written per preset so the show starts with no model call; templates cover a missing preset. */
function openingScene(input: CreateRoomInput): Scene {
  const round1 = (PRESETS[input.preset] ?? PRESETS.custom)?.round1;
  if (round1) return { ...round1, provider: "preset" };
  try {
    const f = fallbackPrompt({
      story: {
        premise: input.premise,
        preset: input.preset,
        summary: "",
        lastNarrations: [],
        roundNo: 1,
        roundsTotal: input.roundsTotal,
        lang: "en",
      },
      lastBeat: null,
    });
    return { title: f.title, text: f.text, narratorOptions: f.narratorOptions, provider: f.provider };
  } catch (err) {
    log.error({ err }, "fallback prompt failed; using the last-resort scene");
    return LAST_RESORT_SCENE;
  }
}

export async function createRoom(
  input: CreateRoomInput,
  host: SessionUser,
  opts: { isDemo?: boolean; demoUserId?: string } = {},
): Promise<{ room: RoomRow; show: ShowRow; hostKey: string; links: RoomLinks }> {
  const db = await getDb();
  const hostKey = newHostKey();
  const showId = newId("sh");
  const timings = defaultTimings();
  const round1 = openingScene(input);

  for (let attempt = 0; attempt < 10; attempt++) {
    const code = newRoomCode();
    const roomId = newId("rm");
    const made = await db.transaction(async (tx) => {
      const q = tx as unknown as Db;
      const [room] = await q
        .insert(schema.rooms)
        .values({
          id: roomId,
          code,
          channelId: channelIdForRoom(code),
          title: input.title,
          hostUserId: host.id,
          hostKeyHash: hashHostKey(hostKey),
          strictFilter: input.strictFilter,
          isDemo: opts.isDemo ?? false,
          demoUserId: opts.demoUserId ?? null,
        })
        .onConflictDoNothing()
        .returning();
      if (!room) return null; // room code taken: try another
      const [show] = await q
        .insert(schema.shows)
        .values({
          id: showId,
          roomId,
          premise: input.premise,
          preset: input.preset,
          roundsTotal: input.roundsTotal,
          stormMs: scaled(input.stormMs),
          voteMs: scaled(input.voteMs),
          // Judge Mode is paced for one person (bots/demo.ts); hosted shows keep the configured timings.
          promptMs: opts.isDemo ? scaled(DEMO.promptMs) : timings.promptMs,
          revealMs: opts.isDemo ? scaled(DEMO.revealMs) : timings.revealMs,
          autoAdvance: input.autoAdvance,
        })
        .returning();
      await q.insert(schema.engineState).values({
        roomId,
        showId,
        roundNo: 0,
        phase: "LOBBY",
        version: 1,
        payload: { rerollUsed: false, distill: "idle", forcedWinnerId: null, voice: false },
      });
      await q.insert(schema.rounds).values({
        id: newId("rd"),
        showId,
        roundNo: 1,
        promptTitle: round1.title,
        promptText: round1.text,
        narratorOptions: round1.narratorOptions,
        promptProvider: round1.provider,
      });
      return { room, show };
    });
    if (!made) continue;

    try {
      await withTimeout(getRealtimeServer().ensureChannel(made.room.channelId, input.title), ENSURE_CHANNEL_TIMEOUT_MS, "ensureChannel");
    } catch (err) {
      log.error({ err, roomCode: code }, "ensureChannel failed; the room exists and the channel will be retried by clients");
    }
    return { room: made.room, show: made.show, hostKey, links: roomLinks(code, hostKey) };
  }
  throw new AppError("ROOM_CODE_EXHAUSTED", "Couldn't create a room right now. Please try again.", 503);
}

export async function getRoomByCode(code: string): Promise<RoomRow | null> {
  const normalized = normalizeRoomCode(code);
  if (!normalized) return null;
  const db = await getDb();
  const [room] = await db.select().from(schema.rooms).where(eq(schema.rooms.code, normalized));
  return room ?? null;
}

export async function requireRoom(code: string): Promise<RoomRow> {
  const room = await getRoomByCode(code);
  if (!room) throw new AppError("ROOM_NOT_FOUND", "We couldn't find that room. Check the code and try again.", 404);
  return room;
}

async function countPlayers(db: Db, roomId: string): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.participants).where(eq(schema.participants.roomId, roomId));
  return r?.n ?? 0;
}

export async function getRoomInfo(room: RoomRow): Promise<RoomInfoRes["room"]> {
  const db = await getDb();
  const [row] = await db
    .select({ phase: schema.engineState.phase, showId: schema.engineState.showId, hostName: schema.users.displayName })
    .from(schema.engineState)
    .innerJoin(schema.users, eq(schema.users.id, room.hostUserId))
    .where(eq(schema.engineState.roomId, room.id));
  if (!row) throw new AppError("ROOM_NOT_FOUND", "We couldn't find that room. Check the code and try again.", 404);
  const players = await countPlayers(db, room.id);
  return {
    code: room.code,
    title: room.title,
    hostName: row.hostName,
    players,
    phase: row.phase as PublicState["phase"],
    showId: row.showId,
    isDemo: room.isDemo,
    full: players >= env().ROOM_PLAYER_CAP,
  };
}

// ---------- joining ----------

const lastTouch = (): Map<string, number> => {
  const g = globalThis as unknown as { __cpTouch?: Map<string, number> };
  return (g.__cpTouch ??= new Map());
};

/** Mark a participant as seen (throttled: at most one write per 15 s per person). */
export async function touchParticipant(roomId: string, userId: string): Promise<void> {
  const key = `${roomId}:${userId}`;
  const now = Date.now();
  const map = lastTouch();
  if (now - (map.get(key) ?? 0) < TOUCH_EVERY_MS) return;
  map.set(key, now);
  const db = await getDb();
  await db
    .update(schema.participants)
    .set({ lastSeenAt: new Date(now) })
    .where(and(eq(schema.participants.roomId, roomId), eq(schema.participants.userId, userId)));
}

function uniqueName(wanted: string, taken: Set<string>): string {
  const key = (s: string) => s.trim().toLowerCase();
  if (!taken.has(key(wanted))) return wanted;
  const base = wanted.replace(/ \d+$/, "");
  for (let n = 2; n < 10_000; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.has(key(candidate))) return candidate;
  }
  return `${base} ${Date.now()}`;
}

/** Add (or refresh) a participant. New participants over the cap get ROOM_FULL; name clashes get " 2", " 3"... */
export async function joinRoom(room: RoomRow, user: SessionUser, lang?: string): Promise<{ displayName: string; isNew: boolean }> {
  return withRoomLock(`join:${room.id}`, async () => {
    const db = await getDb();
    const [existing] = await db
      .select()
      .from(schema.participants)
      .where(and(eq(schema.participants.roomId, room.id), eq(schema.participants.userId, user.id)));
    if (existing) {
      await db
        .update(schema.participants)
        .set({ lastSeenAt: new Date(), ...(lang ? { lang } : {}) })
        .where(and(eq(schema.participants.roomId, room.id), eq(schema.participants.userId, user.id)));
      const [u] = await db.select({ name: schema.users.displayName }).from(schema.users).where(eq(schema.users.id, user.id));
      return { displayName: u?.name ?? user.displayName, isNew: false };
    }
    if ((await countPlayers(db, room.id)) >= env().ROOM_PLAYER_CAP) {
      throw new AppError("ROOM_FULL", "This room is full. Ask the host to start another one.", 409);
    }
    const others = await db
      .select({ name: schema.users.displayName })
      .from(schema.participants)
      .innerJoin(schema.users, eq(schema.users.id, schema.participants.userId))
      .where(eq(schema.participants.roomId, room.id));
    const displayName = uniqueName(user.displayName, new Set(others.map((o) => o.name.trim().toLowerCase())));
    if (displayName !== user.displayName) {
      await db.update(schema.users).set({ displayName }).where(eq(schema.users.id, user.id));
    }
    await db.insert(schema.participants).values({ roomId: room.id, userId: user.id, lang: lang ?? "en" }).onConflictDoNothing();
    return { displayName, isNew: true };
  });
}

/** What the player needs to restore their own view: my vote, my ideas' options, my flags. */
export async function buildMe(room: RoomRow, userId: string): Promise<MeInRoom> {
  const db = await getDb();
  const [row] = await db
    .select({
      name: schema.users.displayName,
      muted: schema.participants.muted,
      banned: schema.participants.banned,
      roundNo: schema.engineState.roundNo,
      showId: schema.engineState.showId,
    })
    .from(schema.participants)
    .innerJoin(schema.users, eq(schema.users.id, schema.participants.userId))
    .innerJoin(schema.engineState, eq(schema.engineState.roomId, schema.participants.roomId))
    .where(and(eq(schema.participants.roomId, room.id), eq(schema.participants.userId, userId)));
  if (!row) throw new AppError("NOT_PARTICIPANT", "Join the room first.", 403);
  const me: MeInRoom = {
    userId,
    displayName: row.name,
    vote: null,
    muted: row.muted,
    banned: row.banned,
    myOptionIds: [],
    ideasThisRound: 0,
  };
  if (row.roundNo < 1) return me;
  const [round] = await db
    .select({ id: schema.rounds.id })
    .from(schema.rounds)
    .where(and(eq(schema.rounds.showId, row.showId), eq(schema.rounds.roundNo, row.roundNo)));
  if (!round) return me;
  const myIdeas = await db
    .select({ id: schema.ideas.id })
    .from(schema.ideas)
    .where(and(eq(schema.ideas.roundId, round.id), eq(schema.ideas.userId, userId), eq(schema.ideas.status, "ok")));
  me.ideasThisRound = myIdeas.length;
  const live = await liveOptions(db, round.id);
  const mine = new Set(myIdeas.map((i) => i.id));
  me.myOptionIds = live.filter((o) => (o.sourceIdeaIds as string[]).some((id) => mine.has(id))).map((o) => o.id);
  const [vote] = await db
    .select({ optionId: schema.votes.optionId })
    .from(schema.votes)
    .where(and(eq(schema.votes.roundId, round.id), eq(schema.votes.userId, userId)));
  me.vote = vote && live.some((o) => o.id === vote.optionId) ? vote.optionId : null;
  return me;
}

// ---------- voting ----------

/** FR-18: participant, not banned, VOTE phase, current round, before the deadline, live option. Last write wins. */
export async function castVote(room: RoomRow, userId: string, body: { roundNo: number; optionId: string }): Promise<string> {
  const db = await getDb();
  const [p] = await db
    .select()
    .from(schema.participants)
    .where(and(eq(schema.participants.roomId, room.id), eq(schema.participants.userId, userId)));
  if (!p) throw new AppError("NOT_PARTICIPANT", "Join the room first.", 403);
  if (p.banned) throw new AppError("BANNED", "You can't vote in this room.", 403);
  const eng = await loadEngineState(room.id, db);
  if (!eng || eng.phase !== "VOTE") throw new AppError("NOT_VOTING", "Voting isn't open right now.", 409);
  if (body.roundNo !== eng.roundNo) throw new AppError("WRONG_ROUND", "That vote is for a different round.", 409);
  if (eng.phaseEndsAt !== null && engineNow() >= eng.phaseEndsAt) throw new AppError("VOTE_CLOSED", "Voting just closed.", 409);
  const [round] = await db
    .select({ id: schema.rounds.id })
    .from(schema.rounds)
    .where(and(eq(schema.rounds.showId, eng.showId), eq(schema.rounds.roundNo, eng.roundNo)));
  const live = round ? await liveOptions(db, round.id) : [];
  if (!round || !live.some((o) => o.id === body.optionId)) throw new AppError("BAD_OPTION", "That option isn't on the ballot.", 400);
  await db
    .insert(schema.votes)
    .values({ roundId: round.id, userId, optionId: body.optionId })
    .onConflictDoUpdate({
      target: [schema.votes.roundId, schema.votes.userId],
      set: { optionId: body.optionId, updatedAt: new Date() },
    });
  markTallyDirty(room.id);
  return body.optionId;
}

// ---------- host actions ----------

async function realtimeCall(what: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await withTimeout(fn(), REALTIME_CALL_TIMEOUT_MS, what);
  } catch (err) {
    log.warn({ err, what }, "realtime call failed; the database flag stays authoritative");
  }
}

async function requireLiveOption(room: RoomRow, optionId: string): Promise<void> {
  const db = await getDb();
  const eng = await loadEngineState(room.id, db);
  const [round] = eng
    ? await db
        .select({ id: schema.rounds.id })
        .from(schema.rounds)
        .where(and(eq(schema.rounds.showId, eng.showId), eq(schema.rounds.roundNo, eng.roundNo)))
    : [];
  const live = round ? await liveOptions(db, round.id) : [];
  if (!live.some((o) => o.id === optionId)) throw new AppError("BAD_OPTION", "That option isn't on the ballot.", 400);
}

async function requireParticipant(room: RoomRow, userId: string): Promise<void> {
  const db = await getDb();
  const [p] = await db
    .select({ userId: schema.participants.userId })
    .from(schema.participants)
    .where(and(eq(schema.participants.roomId, room.id), eq(schema.participants.userId, userId)));
  if (!p) throw new AppError("NOT_PARTICIPANT", "That person isn't in this room.", 404);
}

async function deleteIdea(room: RoomRow, ideaId: string): Promise<void> {
  const db = await getDb();
  const [idea] = await db
    .select({ id: schema.ideas.id, userId: schema.ideas.userId, clientMsgId: schema.ideas.clientMsgId, showId: schema.rounds.showId })
    .from(schema.ideas)
    .innerJoin(schema.rounds, eq(schema.rounds.id, schema.ideas.roundId))
    .innerJoin(schema.shows, eq(schema.shows.id, schema.rounds.showId))
    .where(and(eq(schema.ideas.id, ideaId), eq(schema.shows.roomId, room.id)));
  if (!idea) throw new AppError("IDEA_NOT_FOUND", "That idea no longer exists.", 404);
  await db.update(schema.ideas).set({ status: "deleted" }).where(eq(schema.ideas.id, idea.id));
  const msg: RoomMessage = { t: "mod", hide: [{ userId: idea.userId, clientMsgId: idea.clientMsgId }] };
  await realtimeCall("hide idea", () => getRealtimeServer().sendRoomMessage(room.channelId, NARRATOR_USER_ID, msg));
  markStatsDirty(room.id);
}

async function setMuted(room: RoomRow, userId: string, on: boolean): Promise<void> {
  await requireParticipant(room, userId);
  const db = await getDb();
  await db
    .update(schema.participants)
    .set({ muted: on })
    .where(and(eq(schema.participants.roomId, room.id), eq(schema.participants.userId, userId)));
  await realtimeCall("mute", () => getRealtimeServer().moderate(room.channelId, userId, on ? "mute" : "unmute"));
}

async function setBanned(room: RoomRow, userId: string, on: boolean): Promise<void> {
  await requireParticipant(room, userId);
  const db = await getDb();
  await db
    .update(schema.participants)
    .set({ banned: on })
    .where(and(eq(schema.participants.roomId, room.id), eq(schema.participants.userId, userId)));
  if (on) {
    const eng = await loadEngineState(room.id, db);
    if (eng && eng.roundNo >= 1) {
      const [round] = await db
        .select({ id: schema.rounds.id })
        .from(schema.rounds)
        .where(and(eq(schema.rounds.showId, eng.showId), eq(schema.rounds.roundNo, eng.roundNo)));
      if (round) {
        await db
          .update(schema.ideas)
          .set({ status: "blocked" })
          .where(and(eq(schema.ideas.roundId, round.id), eq(schema.ideas.userId, userId), eq(schema.ideas.status, "ok")));
      }
    }
    await realtimeCall("hide banned user", () =>
      getRealtimeServer().sendRoomMessage(room.channelId, NARRATOR_USER_ID, { t: "mod", hideUserIds: [userId] }),
    );
  }
  await realtimeCall("ban", () => getRealtimeServer().moderate(room.channelId, userId, on ? "ban" : "unban"));
  markStatsDirty(room.id);
}

/** Apply one host action and return the resulting PublicState. The host key was already checked by the route. */
export async function applyHostAction(room: RoomRow, action: HostActionInput): Promise<PublicState> {
  const run = async (trigger: Trigger) => advance(room.id, trigger);
  switch (action.action) {
    case "start":
      await run({ type: "HOST_START" });
      break;
    case "next":
      await run({ type: "HOST_NEXT" });
      break;
    case "endStorm":
      await run({ type: "HOST_END_STORM" });
      break;
    case "extend":
      await run({ type: "HOST_EXTEND", ms: action.ms });
      break;
    case "pause":
      await run({ type: "HOST_PAUSE" });
      break;
    case "resume":
      await run({ type: "HOST_RESUME" });
      break;
    case "forceWin":
      await requireLiveOption(room, action.optionId);
      await run({ type: "HOST_FORCE_WIN", optionId: action.optionId });
      break;
    case "veto":
      await requireLiveOption(room, action.optionId);
      await run({ type: "HOST_VETO", optionId: action.optionId });
      break;
    case "reroll": {
      const r = await run({ type: "HOST_REROLL" });
      if (!r.changed && r.state.phase === "VOTE" && r.state.payload.rerollUsed) {
        throw new AppError("REROLL_USED", "You already re-rolled this round.", 409);
      }
      break;
    }
    case "endShow":
      await run({ type: "HOST_END_SHOW" });
      break;
    case "autoAdvance":
      await run({ type: "HOST_SET_AUTO", on: action.on });
      break;
    case "voice":
      await run({ type: "HOST_SET_VOICE", on: action.on });
      break;
    case "strictFilter": {
      const db = await getDb();
      await db.update(schema.rooms).set({ strictFilter: action.on }).where(eq(schema.rooms.id, room.id));
      break;
    }
    case "deleteIdea":
      await deleteIdea(room, action.ideaId);
      break;
    case "mute":
      await setMuted(room, action.userId, action.on);
      break;
    case "ban":
      await setBanned(room, action.userId, action.on);
      break;
    case "heartbeat":
      await advanceIfDue(room.id);
      break;
  }
  return buildPublicState(room.id);
}

// ---------- host feed ----------

export async function buildHostFeed(room: RoomRow, hostKey: string): Promise<HostFeedRes> {
  const db = await getDb();
  await advanceIfDue(room.id);
  const eng = await loadEngineState(room.id, db);
  if (!eng) throw new AppError("ROOM_NOT_FOUND", "We couldn't find that room. Check the code and try again.", 404);
  const state = await buildPublicState(room.id);
  const [round] =
    eng.roundNo >= 1
      ? await db
          .select()
          .from(schema.rounds)
          .where(and(eq(schema.rounds.showId, eng.showId), eq(schema.rounds.roundNo, eng.roundNo)))
      : [];

  const ideaRows = round
    ? await db
        .select({
          id: schema.ideas.id,
          userId: schema.ideas.userId,
          name: schema.users.displayName,
          isBot: schema.users.isBot,
          text: schema.ideas.text,
          status: schema.ideas.status,
          createdAt: schema.ideas.createdAt,
        })
        .from(schema.ideas)
        .innerJoin(schema.users, eq(schema.users.id, schema.ideas.userId))
        .where(eq(schema.ideas.roundId, round.id))
        .orderBy(desc(schema.ideas.createdAt), desc(schema.ideas.id))
        .limit(FEED_IDEA_LIMIT)
    : [];
  const ideas: HostFeedIdea[] = ideaRows.reverse().map((r) => ({
    id: r.id,
    userId: r.userId,
    name: r.name,
    isBot: r.isBot,
    text: r.text,
    status: r.status as HostFeedIdea["status"],
    createdAt: r.createdAt.getTime(),
  }));

  const counts = await db
    .select({ userId: schema.ideas.userId, n: sql<number>`count(*)::int` })
    .from(schema.ideas)
    .innerJoin(schema.rounds, eq(schema.rounds.id, schema.ideas.roundId))
    .where(and(eq(schema.rounds.showId, eng.showId), eq(schema.ideas.status, "ok")))
    .groupBy(schema.ideas.userId);
  const perUser = new Map(counts.map((c) => [c.userId, c.n]));
  const playerRows = await db
    .select({
      userId: schema.participants.userId,
      name: schema.users.displayName,
      isBot: schema.users.isBot,
      muted: schema.participants.muted,
      banned: schema.participants.banned,
      lastSeenAt: schema.participants.lastSeenAt,
    })
    .from(schema.participants)
    .innerJoin(schema.users, eq(schema.users.id, schema.participants.userId))
    .where(eq(schema.participants.roomId, room.id))
    .orderBy(asc(schema.participants.joinedAt), asc(schema.participants.userId));
  const players: HostFeedPlayer[] = playerRows.map((p) => ({
    userId: p.userId,
    name: p.name,
    isBot: p.isBot,
    muted: p.muted,
    banned: p.banned,
    lastSeenAt: p.lastSeenAt.getTime(),
    ideas: perUser.get(p.userId) ?? 0,
  }));

  let connected: number | null = null;
  try {
    connected = await withTimeout(getRealtimeServer().countParticipants(room.channelId), REALTIME_CALL_TIMEOUT_MS, "countParticipants");
  } catch (err) {
    log.warn({ err }, "countParticipants failed; falling back to last-seen");
  }
  if (connected === null) {
    const since = new Date(Date.now() - SEEN_WINDOW_MS);
    const [r] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.participants)
      .where(and(eq(schema.participants.roomId, room.id), gte(schema.participants.lastSeenAt, since)));
    connected = r?.n ?? 0;
  }

  const [fresh] = await db.select({ strictFilter: schema.rooms.strictFilter }).from(schema.rooms).where(eq(schema.rooms.id, room.id));
  const metrics: HostMetrics = {
    connected,
    ideasThisRound: state.stats.ideasThisRound,
    distillMs: round?.distillMs ?? null,
    distillProvider: round?.distillProvider ?? null,
    fallbackUsed: round?.fallbackUsed ?? false,
    rerollUsed: eng.payload.rerollUsed,
    autoAdvance: eng.autoAdvance,
    strictFilter: fresh?.strictFilter ?? room.strictFilter,
    voice: eng.payload.voice,
  };
  return { ok: true, state, ideas, players, metrics, links: roomLinks(room.code, hostKey) };
}

