// Aggregates for /impact, /story and the admin export (TECH_SPEC §12, FR-27). Everything is computed from
// the tables on request: nothing is stored, nothing is estimated.
//
// What counts as "real" (GOAL D3): a user who is not a bot and not deleted, in a room that is not a demo
// room (rooms.is_demo). Demo rooms and bots are left out of every number on /impact by construction: the
// show list is filtered on rooms.is_demo and bots are dropped by users.is_bot.
//   real person    a real user with >=1 ok idea or >=1 vote in a real show
//   completed show status finale/ended, >=1 revealed round and >=1 real person (a show with nobody in it is not usage)
//   revealed round rounds.status reveal|done with a winner
//   canon maker    a real user holding a CANON receipt in a real show
//   distill stats  recorded rounds that had at least one idea (an empty round is improvised instantly by the narrator and would flatter the numbers)
import { createHash, timingSafeEqual } from "node:crypto";
import { and, asc, eq, gt, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { ImpactRes, StoryRes, StoryRound } from "./api/contracts";
import { env } from "./config";
import { getDb, schema, type Db } from "./db/client";
import { contributorsByOption, topCanonMakers } from "./engine/publish";
import type { PresetId } from "./realtime/types";

const { users, rooms, shows, rounds, ideas, options, votes, receipts } = schema;

export const IMPACT_TTL_MS = 60_000;
const IMPACT_SESSION_LIMIT = 100;
const STORY_CANON_LIMIT = 20;
const REVEALED = ["reveal", "done"];

// ---------- percentile math (pure) ----------

/** Middle value; the mean of the two middle values for an even count. null for no data. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return Math.round(s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2);
}

/** Nearest-rank percentile: the smallest value with at least p% of the data at or below it. Never understates. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const rank = Math.min(s.length, Math.max(1, Math.ceil((p / 100) * s.length)));
  return Math.round(s[rank - 1]);
}

// ---------- per-show aggregates ----------

type ShowAgg = {
  showId: string;
  roomCode: string;
  title: string;
  isDemo: boolean;
  preset: string;
  status: string;
  roundsTotal: number;
  roundsRevealed: number;
  createdAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
  humanIdeas: number;
  botIdeas: number;
  humanVotes: number;
  humanPeople: Set<string>;
  botPlayers: Set<string>;
  canonMakers: Set<string>;
};

/** realOnly: only shows whose room is not a demo room (SQL filter). Bots are always split out by users.is_bot. */
async function loadShowAggs(db: Db, realOnly: boolean): Promise<Map<string, ShowAgg>> {
  const base = await db
    .select({
      showId: shows.id,
      roomCode: rooms.code,
      title: rooms.title,
      isDemo: rooms.isDemo,
      preset: shows.preset,
      status: shows.status,
      roundsTotal: shows.roundsTotal,
      createdAt: shows.createdAt,
      startedAt: shows.startedAt,
      endedAt: shows.endedAt,
    })
    .from(shows)
    .innerJoin(rooms, eq(rooms.id, shows.roomId))
    .where(realOnly ? eq(rooms.isDemo, false) : undefined);

  const map = new Map<string, ShowAgg>();
  for (const b of base) {
    map.set(b.showId, {
      ...b,
      roundsRevealed: 0,
      humanIdeas: 0,
      botIdeas: 0,
      humanVotes: 0,
      humanPeople: new Set(),
      botPlayers: new Set(),
      canonMakers: new Set(),
    });
  }
  if (map.size === 0) return map;

  const live = isNull(users.deletedAt);
  const [revealed, ideaCounts, voteCounts, ideaPeople, votePeople, canon] = await Promise.all([
    db
      .select({ showId: rounds.showId, n: sql<number>`count(*)::int` })
      .from(rounds)
      .where(and(inArray(rounds.status, REVEALED), isNotNull(rounds.winnerOptionId)))
      .groupBy(rounds.showId),
    db
      .select({ showId: rounds.showId, isBot: users.isBot, n: sql<number>`count(*)::int` })
      .from(ideas)
      .innerJoin(rounds, eq(rounds.id, ideas.roundId))
      .innerJoin(users, eq(users.id, ideas.userId))
      .where(and(eq(ideas.status, "ok"), live))
      .groupBy(rounds.showId, users.isBot),
    db
      .select({ showId: rounds.showId, isBot: users.isBot, n: sql<number>`count(*)::int` })
      .from(votes)
      .innerJoin(rounds, eq(rounds.id, votes.roundId))
      .innerJoin(users, eq(users.id, votes.userId))
      .where(live)
      .groupBy(rounds.showId, users.isBot),
    db
      .selectDistinct({ showId: rounds.showId, userId: ideas.userId, isBot: users.isBot })
      .from(ideas)
      .innerJoin(rounds, eq(rounds.id, ideas.roundId))
      .innerJoin(users, eq(users.id, ideas.userId))
      .where(and(eq(ideas.status, "ok"), live)),
    db
      .selectDistinct({ showId: rounds.showId, userId: votes.userId, isBot: users.isBot })
      .from(votes)
      .innerJoin(rounds, eq(rounds.id, votes.roundId))
      .innerJoin(users, eq(users.id, votes.userId))
      .where(live),
    db
      .selectDistinct({ showId: receipts.showId, userId: receipts.userId })
      .from(receipts)
      .innerJoin(users, eq(users.id, receipts.userId))
      .where(and(eq(receipts.type, "CANON"), eq(users.isBot, false), live)),
  ]);

  for (const r of revealed) {
    const s = map.get(r.showId);
    if (s) s.roundsRevealed = r.n;
  }
  for (const r of ideaCounts) {
    const s = map.get(r.showId);
    if (!s) continue;
    if (r.isBot) s.botIdeas += r.n;
    else s.humanIdeas += r.n;
  }
  for (const r of voteCounts) {
    const s = map.get(r.showId);
    if (s && !r.isBot) s.humanVotes += r.n;
  }
  for (const r of [...ideaPeople, ...votePeople]) {
    const s = map.get(r.showId);
    if (s) (r.isBot ? s.botPlayers : s.humanPeople).add(r.userId);
  }
  for (const r of canon) map.get(r.showId)?.canonMakers.add(r.userId);
  return map;
}

const isCompleted = (s: ShowAgg): boolean =>
  (s.status === "finale" || s.status === "ended") && s.roundsRevealed >= 1 && s.humanPeople.size >= 1;

// ---------- impact ----------

type ImpactCache = { at: number; value?: ImpactRes; pending?: Promise<ImpactRes> };
const g = globalThis as unknown as { __cpImpact?: ImpactCache };

async function computeImpact(now: number): Promise<ImpactRes> {
  const db = await getDb();
  const aggs = [...(await loadShowAggs(db, true)).values()];
  const real = aggs.filter((s) => s.humanPeople.size >= 1);

  const people = new Set<string>();
  const canon = new Set<string>();
  let ideasTotal = 0;
  for (const s of real) {
    s.humanPeople.forEach((u) => people.add(u));
    s.canonMakers.forEach((u) => canon.add(u));
    ideasTotal += s.humanIdeas;
  }

  const recorded = await db
    .select({ ms: rounds.distillMs, fallback: rounds.fallbackUsed })
    .from(rounds)
    .innerJoin(shows, eq(shows.id, rounds.showId))
    .innerJoin(rooms, eq(rooms.id, shows.roomId))
    .where(and(eq(rooms.isDemo, false), isNotNull(rounds.distillMs), gt(rounds.ideasCount, 0)));
  const ms = recorded.map((r) => r.ms as number);
  const fallbackRate = recorded.length ? Math.round((recorded.filter((r) => r.fallback).length / recorded.length) * 10_000) / 10_000 : null;

  const sessions = real
    .map((s) => ({
      showId: s.showId,
      title: s.title,
      date: (s.startedAt ?? s.createdAt).getTime(),
      people: s.humanPeople.size,
      ideas: s.humanIdeas,
      rounds: s.roundsRevealed,
    }))
    .sort((a, b) => b.date - a.date)
    .slice(0, IMPACT_SESSION_LIMIT);

  return {
    ok: true,
    totals: {
      realPeople: people.size,
      showsCompleted: aggs.filter(isCompleted).length,
      ideas: ideasTotal,
      canonMakers: canon.size,
      medianDistillMs: median(ms),
      p95DistillMs: percentile(ms, 95),
      fallbackRate,
    },
    sessions,
    generatedAt: now,
  };
}

/** Real usage only, cached for 60 s per process (on globalThis: route bundles do not share modules). */
export async function getImpact(now: number = Date.now()): Promise<ImpactRes> {
  const c = (g.__cpImpact ??= { at: 0 });
  if (c.value && now - c.at < IMPACT_TTL_MS) return c.value;
  if (c.pending) return c.pending;
  const run = computeImpact(now)
    .then((value) => {
      c.value = value;
      c.at = now;
      return value;
    })
    .finally(() => {
      c.pending = undefined;
    });
  c.pending = run;
  return run;
}

export function resetMetricsCache(): void {
  g.__cpImpact = undefined;
}

// ---------- story ----------

const SHOW_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Recap data for /story/[showId]. null when the show does not exist. Names come from the users table. */
export async function loadStory(showId: string): Promise<StoryRes | null> {
  if (!SHOW_ID_RE.test(showId)) return null;
  const db = await getDb();
  const [row] = await db
    .select({ show: shows, roomCode: rooms.code, title: rooms.title, isDemo: rooms.isDemo })
    .from(shows)
    .innerJoin(rooms, eq(rooms.id, shows.roomId))
    .where(eq(shows.id, showId));
  if (!row) return null;

  const played = await db
    .select({ round: rounds, winner: options })
    .from(rounds)
    .leftJoin(options, eq(options.id, rounds.winnerOptionId))
    .where(and(eq(rounds.showId, showId), inArray(rounds.status, REVEALED)))
    .orderBy(asc(rounds.roundNo));

  const credits = await contributorsByOption(
    db,
    played.flatMap((p) => (p.winner ? [{ id: p.winner.id, sourceIdeaIds: p.winner.sourceIdeaIds as string[] }] : [])),
  );

  const storyRounds: StoryRound[] = played.map(({ round, winner }) => {
    const people = (winner && credits.get(winner.id)?.people) || [];
    return {
      roundNo: round.roundNo,
      prompt: { title: round.promptTitle, text: round.promptText },
      winner: winner ? { label: winner.label, kind: winner.kind } : null,
      narration: round.narration,
      credit: people.slice(0, 3).map((p) => ({ name: p.name, bot: p.bot })),
      more: Math.max(0, people.length - 3),
    };
  });

  const s = row.show;
  return {
    ok: true,
    show: {
      id: s.id,
      roomCode: row.roomCode,
      title: row.title,
      storyTitle: s.storyTitle,
      premise: s.premise,
      preset: s.preset as PresetId,
      isDemo: row.isDemo,
      recap: s.storyRecap,
      tagline: s.storyTagline,
      status: s.status,
      startedAt: s.startedAt ? s.startedAt.getTime() : null,
      endedAt: s.endedAt ? s.endedAt.getTime() : null,
    },
    rounds: storyRounds,
    canonMakers: await topCanonMakers(db, showId, STORY_CANON_LIMIT),
  };
}

// ---------- admin export ----------

export type AdminSession = {
  showId: string;
  roomCode: string;
  title: string;
  kind: "live" | "demo";
  preset: string;
  status: string;
  roundsTotal: number;
  roundsRevealed: number;
  realPeople: number;
  realIdeas: number;
  realVotes: number;
  canonMakers: number;
  botPlayers: number;
  botIdeas: number;
  createdAt: string;
  startedAt: string;
  endedAt: string;
};

/** Every show, demo rooms included but labelled, newest first. */
export async function adminSessions(): Promise<AdminSession[]> {
  const db = await getDb();
  const iso = (d: Date | null) => (d ? d.toISOString() : "");
  return [...(await loadShowAggs(db, false)).values()]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((s) => ({
      showId: s.showId,
      roomCode: s.roomCode,
      title: s.title,
      kind: s.isDemo ? "demo" : "live",
      preset: s.preset,
      status: s.status,
      roundsTotal: s.roundsTotal,
      roundsRevealed: s.roundsRevealed,
      realPeople: s.humanPeople.size,
      realIdeas: s.humanIdeas,
      realVotes: s.humanVotes,
      canonMakers: s.canonMakers.size,
      botPlayers: s.botPlayers.size,
      botIdeas: s.botIdeas,
      createdAt: iso(s.createdAt),
      startedAt: iso(s.startedAt),
      endedAt: iso(s.endedAt),
    }));
}

/** RFC 4180 quoting, plus a leading apostrophe on text that a spreadsheet would run as a formula. */
export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T extends Record<string, string | number | boolean | null>>(rows: readonly T[], columns: readonly (keyof T & string)[]): string {
  const lines = [columns.join(",")];
  for (const r of rows) lines.push(columns.map((c) => csvCell(r[c])).join(","));
  return `${lines.join("\r\n")}\r\n`;
}

export const ADMIN_COLUMNS = [
  "showId",
  "roomCode",
  "title",
  "kind",
  "preset",
  "status",
  "roundsTotal",
  "roundsRevealed",
  "realPeople",
  "realIdeas",
  "realVotes",
  "canonMakers",
  "botPlayers",
  "botIdeas",
  "createdAt",
  "startedAt",
  "endedAt",
] as const satisfies readonly (keyof AdminSession)[];

export async function adminCsv(): Promise<string> {
  return toCsv(await adminSessions(), ADMIN_COLUMNS);
}

// ---------- admin access ----------

export type AdminAccess = "ok" | "disabled" | "denied";

/** ADMIN_TOKEN unset: admin is off. Otherwise the token must match (compared as SHA-256 digests, constant time). */
export function adminAccess(token: string | null | undefined): AdminAccess {
  const expected = env().ADMIN_TOKEN;
  if (!expected) return "disabled";
  if (!token) return "denied";
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(token), digest(expected)) ? "ok" : "denied";
}
