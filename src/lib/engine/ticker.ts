// In-process deadline ticker (TECH_SPEC §5.3). Lazy advance on reads covers hosts without a long-lived process.
import { isNotNull, lte, and } from "drizzle-orm";
import { getDb, schema } from "../db/client";
import { log } from "../log";
import { advance, engineNow } from "./advance";
import { isRoomBusy } from "./lock";

export const TICK_INTERVAL_MS = 250;

type Ticker = { timer: ReturnType<typeof setInterval>; running: Set<string> };
const g = globalThis as unknown as { __cpTicker?: Ticker };

/** One scan: advance(TICK) every room whose deadline has passed. Skips rooms whose mutex is busy. `wait=false` returns once launched, so a slow room never delays the next scan. */
export async function tickOnce(now: number = engineNow(), wait = true): Promise<number> {
  const db = await getDb();
  const due = await db
    .select({ roomId: schema.engineState.roomId })
    .from(schema.engineState)
    .where(and(isNotNull(schema.engineState.phaseEndsAt), lte(schema.engineState.phaseEndsAt, new Date(now))));
  const running = g.__cpTicker?.running ?? new Set<string>();
  const work = due
    .filter(({ roomId }) => !running.has(roomId) && !isRoomBusy(roomId))
    .map(async ({ roomId }) => {
      running.add(roomId);
      try {
        await advance(roomId, { type: "TICK" }, now);
      } catch (err) {
        log.error({ err, roomId }, "tick failed");
      } finally {
        running.delete(roomId);
      }
    });
  const all = Promise.all(work);
  if (wait) await all;
  return work.length;
}

/** Start the 250 ms ticker once per process (guarded on globalThis: dev reloads and bundles share it). */
export function startTicker(): void {
  if (g.__cpTicker) return;
  let scanning = false;
  const timer = setInterval(() => {
    if (scanning) return;
    scanning = true;
    tickOnce(engineNow(), false)
      .catch((err) => log.error({ err }, "ticker scan failed"))
      .finally(() => {
        scanning = false;
      });
  }, TICK_INTERVAL_MS);
  timer.unref?.();
  g.__cpTicker = { timer, running: new Set() };
}

export function stopTicker(): void {
  if (!g.__cpTicker) return;
  clearInterval(g.__cpTicker.timer);
  g.__cpTicker = undefined;
}
