// PERF2: the migration adds the composite / partial indexes and drops the ones they make redundant.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { useTestDb, type Db } from "@/lib/db/client";

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await useTestDb());
});
afterAll(async () => close());

async function indexes(table: string): Promise<Record<string, string>> {
  const res = await db.execute(sql`select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = ${table}`);
  return Object.fromEntries((res.rows as { indexname: string; indexdef: string }[]).map((r) => [r.indexname, r.indexdef]));
}

/** The plan of a query with sequential scans switched off, so a usable index shows even on an empty table. */
async function plan(query: ReturnType<typeof sql>): Promise<string> {
  await db.execute(sql`set enable_seqscan = off`);
  try {
    const res = await db.execute(sql`explain ${query}`);
    return (res.rows as Record<string, string>[]).map((r) => Object.values(r)[0]).join("\n");
  } finally {
    await db.execute(sql`reset enable_seqscan`);
  }
}

describe("indexes after migration 0001", () => {
  it("ideas: (round_id, user_id) replaces the single-column round and user indexes", async () => {
    const ix = await indexes("ideas");
    expect(ix.ideas_round_user_idx).toMatch(/\(round_id, user_id\)/);
    expect(ix.ideas_user_msg_uq).toMatch(/\(user_id, client_msg_id\)/);
    expect(ix).not.toHaveProperty("ideas_round_idx");
    expect(ix).not.toHaveProperty("ideas_user_idx");
  });

  it("receipts: (show_id, type, user_id) replaces the show and user indexes", async () => {
    const ix = await indexes("receipts");
    expect(ix.receipts_show_type_user_idx).toMatch(/\(show_id, type, user_id\)/);
    expect(ix.receipts_once_uq).toMatch(/\(user_id, round_id, type, option_id\)/);
    expect(ix).not.toHaveProperty("receipts_show_idx");
    expect(ix).not.toHaveProperty("receipts_user_idx");
  });

  it("engine_state: a partial index on the deadline", async () => {
    const ix = await indexes("engine_state");
    expect(ix.engine_state_deadline_idx).toMatch(/\(phase_ends_at\)/);
    expect(ix.engine_state_deadline_idx.toLowerCase()).toMatch(/where .*phase_ends_at is not null/);
  });

  it("the queries they are for can use them", async () => {
    const ticker = await plan(sql`select room_id from engine_state where phase_ends_at is not null and phase_ends_at <= now()`);
    expect(ticker).toContain("engine_state_deadline_idx");

    const cap = await plan(sql`select count(*) from ideas where round_id = 'r' and user_id = 'u'`);
    expect(cap).toContain("ideas_round_user_idx");
    const byRound = await plan(sql`select count(*) from ideas where round_id = 'r'`);
    expect(byRound).toContain("ideas_round_user_idx");
    const byUser = await plan(sql`select id from ideas where user_id = 'u'`);
    expect(byUser).toContain("ideas_user_msg_uq");

    const canon = await plan(sql`select count(distinct user_id) from receipts where show_id = 's' and type = 'CANON'`);
    expect(canon).toContain("receipts_show_type_user_idx");
  });
});
