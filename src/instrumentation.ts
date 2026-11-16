// Runs once when the Node server starts (never on the edge runtime). Everything sits inside the positive
// NEXT_RUNTIME check so the edge bundle drops it and never sees Node-only imports.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertBootable } = await import("@/lib/config");
    assertBootable(); // refuses REALTIME_MODE=mock in production
    if (process.env.NEXT_PHASE === "phase-production-build") return;

    const { log } = await import("@/lib/log");
    const { getDb } = await import("@/lib/db/client");
    await getDb();

    // Best effort: a slow or failing transport setup must not keep the server from starting.
    try {
      const { getRealtimeServer } = await import("@/lib/realtime/index");
      await Promise.race([getRealtimeServer().configurePriorities(), new Promise<void>((resolve) => setTimeout(resolve, 3000))]);
    } catch (err) {
      log.warn({ err }, "realtime priorities not configured");
    }

    const { startTicker } = await import("@/lib/engine/ticker");
    startTicker();

    // Slow effects that were in flight when the previous process died (narration, finale, receipts).
    const { recoverInterruptedEffects } = await import("@/lib/engine/effects");
    void recoverInterruptedEffects().catch((err) => log.error({ err }, "effect recovery failed"));
  }
}
