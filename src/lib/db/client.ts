import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { drizzle as drizzleLite, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate as migrateLite } from "drizzle-orm/pglite/migrator";
import { Pool } from "pg";
import { env } from "../config";
import { log } from "../log";
import * as schema from "./schema";

// One query-builder type for both drivers (identical pg dialect API).
export type Db = NodePgDatabase<typeof schema>;
export type DbKind = "pg" | "pglite";

type Holder = { db: Db; kind: DbKind; ready: Promise<void>; close: () => Promise<void> };
const g = globalThis as unknown as { __cpDb?: Holder };

export const MIGRATIONS_DIR = path.join(process.cwd(), "src", "lib", "db", "migrations");

function open(): Holder {
  const url = env().DATABASE_URL;
  if (url) {
    const pool = new Pool({ connectionString: url, max: 10 });
    const db = drizzlePg(pool, { schema });
    return {
      db,
      kind: "pg",
      ready: migratePg(db, { migrationsFolder: MIGRATIONS_DIR }),
      close: () => pool.end(),
    };
  }
  const dir = path.resolve(env().PGLITE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  const lite: PgliteDatabase<typeof schema> = drizzleLite(client, { schema });
  return {
    db: lite as unknown as Db,
    kind: "pglite",
    ready: migrateLite(lite, { migrationsFolder: MIGRATIONS_DIR }),
    close: () => client.close(),
  };
}

/** Shared DB handle (process singleton on globalThis so route bundles and instrumentation share it). */
export async function getDb(): Promise<Db> {
  if (!g.__cpDb) {
    g.__cpDb = open();
    g.__cpDb.ready.catch((err) => log.error({ err }, "database migration failed"));
  }
  await g.__cpDb.ready;
  return g.__cpDb.db;
}

export function dbKind(): DbKind {
  return g.__cpDb?.kind ?? (env().DATABASE_URL ? "pg" : "pglite");
}

/** Tests: fresh in-memory PGlite, migrated, installed as the global DB. */
export async function useTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  if (g.__cpDb) await g.__cpDb.close().catch(() => {});
  const client = new PGlite();
  const lite: PgliteDatabase<typeof schema> = drizzleLite(client, { schema });
  const ready = migrateLite(lite, { migrationsFolder: MIGRATIONS_DIR });
  const holder: Holder = { db: lite as unknown as Db, kind: "pglite", ready, close: () => client.close() };
  g.__cpDb = holder;
  await ready;
  return {
    db: holder.db,
    close: async () => {
      if (g.__cpDb === holder) g.__cpDb = undefined;
      await client.close();
    },
  };
}

export { schema };
