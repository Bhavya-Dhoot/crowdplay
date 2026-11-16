// Row builders for the depth tests: shows, rounds, options, ideas, votes and receipts inserted straight into
// the test database, so the metrics and story loaders are checked against exactly the rows a test describes.
// Not a test file (the vitest include only matches *.test.ts).
import { eq } from "drizzle-orm";
import { schema, type Db } from "@/lib/db/client";
import { newId } from "@/lib/ids";

export async function user(db: Db, name: string, o: { bot?: boolean; deleted?: boolean } = {}): Promise<string> {
  const id = newId(o.bot ? "b" : "u");
  await db.insert(schema.users).values({ id, displayName: name, isBot: o.bot ?? false, deletedAt: o.deleted ? new Date() : null });
  return id;
}

export type Fx = { showId: string; roomId: string; code: string; hostId: string };

let codeSeq = 0;
const nextCode = (): string => `TST${String.fromCharCode(65 + Math.floor(codeSeq / 26) % 26)}${String.fromCharCode(65 + (codeSeq++ % 26))}`;

export async function show(
  db: Db,
  o: { title?: string; demo?: boolean; status?: string; roundsTotal?: number; startedAt?: Date | null; storyRecap?: string | null; storyTagline?: string | null; storyTitle?: string | null } = {},
): Promise<Fx> {
  const hostId = await user(db, "Host");
  const roomId = newId("rm");
  const showId = newId("sh");
  const code = nextCode();
  await db.insert(schema.rooms).values({
    id: roomId,
    code,
    channelId: `cp_${code}`,
    title: o.title ?? "Test show",
    hostUserId: hostId,
    hostKeyHash: "x",
    isDemo: o.demo ?? false,
  });
  await db.insert(schema.shows).values({
    id: showId,
    roomId,
    premise: "A vault full of rubber ducks.",
    preset: "heist",
    roundsTotal: o.roundsTotal ?? 3,
    stormMs: 3000,
    voteMs: 3000,
    promptMs: 1000,
    revealMs: 1000,
    status: o.status ?? "ended",
    startedAt: o.startedAt === undefined ? new Date() : o.startedAt,
    storyRecap: o.storyRecap ?? null,
    storyTagline: o.storyTagline ?? null,
    storyTitle: o.storyTitle ?? null,
  });
  return { showId, roomId, code, hostId };
}

export async function round(
  db: Db,
  showId: string,
  roundNo: number,
  o: { status?: string; ideasCount?: number; distillMs?: number | null; fallback?: boolean; narration?: string | null; winnerOptionId?: string | null; title?: string } = {},
): Promise<string> {
  const id = newId("rd");
  await db.insert(schema.rounds).values({
    id,
    showId,
    roundNo,
    promptTitle: o.title ?? `Scene ${roundNo}`,
    promptText: `What happens in scene ${roundNo}?`,
    narratorOptions: ["a", "b", "c"],
    status: o.status ?? "done",
    ideasCount: o.ideasCount ?? 0,
    distillMs: o.distillMs ?? null,
    fallbackUsed: o.fallback ?? false,
    winnerOptionId: o.winnerOptionId ?? null,
    narration: o.narration ?? null,
  });
  return id;
}

export async function idea(db: Db, roundId: string, userId: string, text: string, status = "ok", at?: Date): Promise<string> {
  const id = newId("id");
  await db.insert(schema.ideas).values({ id, roundId, userId, text, clientMsgId: `cm_${id}`, source: "post", status, ...(at ? { createdAt: at } : {}) });
  return id;
}

export async function option(
  db: Db,
  roundId: string,
  slot: "A" | "B" | "C",
  kind: "crowd" | "wildcard" | "narrator",
  label: string,
  ideaIds: string[] = [],
): Promise<string> {
  const id = newId("op");
  await db.insert(schema.options).values({ id, roundId, slot, kind, label, sourceIdeaIds: ideaIds, supporters: ideaIds.length, rank: slot === "A" ? 1 : slot === "B" ? 2 : 3 });
  return id;
}

export async function vote(db: Db, roundId: string, userId: string, optionId: string): Promise<void> {
  await db.insert(schema.votes).values({ roundId, userId, optionId });
}

export async function receipt(
  db: Db,
  a: { userId: string; showId: string; roundId: string; optionId: string; ideaId: string; type?: "BALLOT" | "CANON" },
): Promise<void> {
  await db.insert(schema.receipts).values({ id: newId("rc"), type: "CANON", ...a });
}

/**
 * A played round: three options, a winner and the ideas behind it. `winnerUsers` wrote the winning option's
 * ideas in order (earliest first); the round counts as revealed with `narration`.
 */
export async function playedRound(
  db: Db,
  fx: Fx,
  roundNo: number,
  o: { winnerUsers: string[]; winnerKind?: "crowd" | "wildcard" | "narrator"; narration?: string | null; distillMs?: number | null; fallback?: boolean; status?: string },
): Promise<{ roundId: string; winnerId: string; ideaIds: string[] }> {
  const roundId = await round(db, fx.showId, roundNo, {
    status: o.status ?? "done",
    ideasCount: o.winnerUsers.length,
    distillMs: o.distillMs ?? null,
    fallback: o.fallback,
    narration: o.narration === undefined ? `Narration ${roundNo}` : o.narration,
  });
  const base = Date.now() - 100_000;
  const ideaIds: string[] = [];
  for (const [i, u] of o.winnerUsers.entries()) ideaIds.push(await idea(db, roundId, u, `winning idea ${roundNo}.${i}`, "ok", new Date(base + i * 1000)));
  const winnerId = await option(db, roundId, "A", o.winnerKind ?? "crowd", `Winner ${roundNo}`, o.winnerKind === "narrator" ? [] : ideaIds);
  await option(db, roundId, "B", "crowd", `Loser ${roundNo}`);
  await option(db, roundId, "C", "wildcard", `Wild ${roundNo}`);
  await db.update(schema.rounds).set({ winnerOptionId: winnerId }).where(eq(schema.rounds.id, roundId));
  return { roundId, winnerId, ideaIds };
}
