// Route-level helpers for the engine integration tests. Import this file only after the test's vi.mock calls
// (it pulls in the real route handlers); engine-harness.ts stays free of app imports for that reason.
import { and, eq } from "drizzle-orm";
import { expect } from "vitest";
import { GET as stateRoute } from "@/app/api/rooms/[code]/state/route";
import { POST as joinRoute } from "@/app/api/rooms/[code]/join/route";
import { POST as voteRoute } from "@/app/api/rooms/[code]/vote/route";
import { POST as hostRoute } from "@/app/api/rooms/[code]/host/route";
import { POST as createRoute } from "@/app/api/rooms/route";
import type { CreateRoomRes, JoinRes, StateRes } from "@/lib/api/contracts";
import { getDb, schema } from "@/lib/db/client";
import { advance, setEngineClock } from "@/lib/engine/advance";
import type { PublicState } from "@/lib/realtime/types";
import { getRoomByCode } from "@/lib/rooms";
import { T0, addIdea, call, clock, makeUser, roundRow, type TestUser } from "./engine-harness";

export type Show = { code: string; showId: string; roomId: string; hostKey: string; host: TestUser; players: TestUser[] };

export async function newShow(opts: {
  autoAdvance: boolean;
  names?: string[];
  roundsTotal?: number;
  join?: boolean;
  stormMs?: number;
  voteMs?: number;
}): Promise<Show> {
  const db = await getDb();
  const host = await makeUser(db, "Hosty");
  const players: TestUser[] = [];
  for (const n of opts.names ?? ["Ava", "Ben", "Cleo"]) players.push(await makeUser(db, n));
  const created = await call<CreateRoomRes>(
    createRoute,
    new Request("http://localhost/api/rooms", {
      method: "POST",
      headers: { cookie: `cp_session=${host.token}`, "content-type": "application/json" },
      body: JSON.stringify({
        title: "Heist Night",
        preset: "heist",
        premise: "A vault full of rubber ducks.",
        roundsTotal: opts.roundsTotal ?? 3,
        stormMs: opts.stormMs ?? 3000,
        voteMs: opts.voteMs ?? 3000,
        autoAdvance: opts.autoAdvance,
        strictFilter: true,
      }),
    }),
  );
  expect(created.status).toBe(200);
  const room = (await getRoomByCode(created.body.code))!;
  if (opts.join !== false) {
    for (const p of players) {
      const j = await joinAs(room.code, p);
      expect(j.status).toBe(200);
      expect(j.body.channelId).toBe(`cp_${room.code}`);
    }
  }
  return { code: room.code, showId: created.body.showId, roomId: room.id, hostKey: created.body.hostKey, host, players };
}

export const joinAs = (code: string, u: TestUser, body: unknown = {}) =>
  call<JoinRes & { code?: string; message?: string }>(
    joinRoute,
    new Request("http://localhost/x", { method: "POST", headers: { cookie: `cp_session=${u.token}`, "content-type": "application/json" }, body: JSON.stringify(body) }),
    code,
  );

export const hostAct = (s: Pick<Show, "code" | "hostKey">, body: Record<string, unknown>) =>
  call<{ ok: boolean; state: PublicState; code?: string; message?: string }>(
    hostRoute,
    new Request("http://localhost/x", { method: "POST", headers: { "x-host-key": s.hostKey, "content-type": "application/json" }, body: JSON.stringify(body) }),
    s.code,
  );

export const getState = async (s: Pick<Show, "code">): Promise<PublicState> =>
  (await call<StateRes>(stateRoute, new Request("http://localhost/x"), s.code)).body.state;

export const vote = (s: Pick<Show, "code">, u: TestUser, roundNo: number, optionId: string) =>
  call<{ ok: boolean; code?: string; optionId?: string }>(
    voteRoute,
    new Request("http://localhost/x", { method: "POST", headers: { cookie: `cp_session=${u.token}`, "content-type": "application/json" }, body: JSON.stringify({ roundNo, optionId }) }),
    s.code,
  );

/** Round-r ideas: A (2 supporters: players[0], players[1]), B (players[2]), C (players[0]), backup (players[1]). */
export async function stormIdeas(s: Show, r: number): Promise<void> {
  const db = await getDb();
  const [a, b, c] = s.players;
  const t = clock.now;
  await addIdea(db, s.showId, r, a.id, `Rob the vault r${r}`, t + 1);
  await addIdea(db, s.showId, r, b.id, `Rob the vault r${r}`, t + 2);
  await addIdea(db, s.showId, r, c.id, `Hire a pigeon r${r}`, t + 3);
  await addIdea(db, s.showId, r, a.id, `Bribe the guard r${r}`, t + 4);
  await addIdea(db, s.showId, r, b.id, `Dig a tunnel r${r}`, t + 5);
}

export async function receiptRows(s: Pick<Show, "showId">, roundNo: number, type: "BALLOT" | "CANON") {
  const db = await getDb();
  const round = await roundRow(db, s.showId, roundNo);
  return db
    .select({ userId: schema.receipts.userId, optionId: schema.receipts.optionId, delivered: schema.receipts.deliveredNexconn })
    .from(schema.receipts)
    .where(and(eq(schema.receipts.roundId, round.id), eq(schema.receipts.type, type)));
}

export function installClock(): void {
  clock.now = T0;
  setEngineClock(() => clock.now);
}

/** Move the clock to the room's current deadline and fire one TICK (the ticker's job in production). */
export async function tickToDeadline(roomId: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db.select({ ends: schema.engineState.phaseEndsAt }).from(schema.engineState).where(eq(schema.engineState.roomId, roomId));
  if (!row?.ends) throw new Error("room has no deadline to tick to");
  clock.set(row.ends.getTime());
  return (await advance(roomId, { type: "TICK" })).changed;
}
