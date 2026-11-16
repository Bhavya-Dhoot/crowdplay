import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { HealthRes } from "@/lib/api/contracts";
import { env, isLiveLlm } from "@/lib/config";
import { dbKind, getDb } from "@/lib/db/client";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

let version: string | undefined;
function appVersion(): string {
  if (version) return version;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as { version?: string };
    version = pkg.version ?? "unknown";
  } catch {
    version = "unknown";
  }
  return version;
}

export async function GET(): Promise<Response> {
  let dbOk = true;
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
  } catch (err) {
    dbOk = false;
    log.error({ err }, "health: database probe failed");
  }
  const body: HealthRes = {
    ok: dbOk,
    realtimeMode: env().REALTIME_MODE,
    llmMode: isLiveLlm() ? "live" : "mock",
    db: dbKind(),
    version: appVersion(),
  };
  // 503 lets the platform health check (Docker/Fly/Railway) pull an instance whose database is gone.
  return Response.json(body, { status: dbOk ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
