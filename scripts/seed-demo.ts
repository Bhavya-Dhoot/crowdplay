// pnpm seed:demo: plays one labelled DEMO show to its finale through the real engine, so /story/<id> has
// something to show locally. The room is created with is_demo = true, its host and its 30 players are bots,
// and it uses the mock transport. Demo rows are excluded from /impact by construction, so this can never
// add traction. Needs the database to itself: stop `pnpm dev` first (PGlite is single-process), or point
// DATABASE_URL / PGLITE_DIR at a database the dev server also uses only after this script has finished.
//
// Takes about a minute. Prints the story, screen and join links when it is done.

// Fast but real timings. Bots schedule their ideas and votes inside the live windows, so the storm and vote
// need a few seconds. These are set before any app module reads its config.
process.env.REALTIME_MODE = "mock";
process.env.LLM_MODE ??= "mock";
process.env.PROMPT_MS ??= "2500";
process.env.REVEAL_MS ??= "4000";
delete process.env.TIMING_SCALE;

const DEMO_HOST_ID = "b_demohost00000000"; // "b_" + 16 characters, stable across runs
const ROUNDS = 3;
const TIMEOUT_MS = 4 * 60_000;

async function main(): Promise<void> {
  const { eq, sql } = await import("drizzle-orm");
  const { env } = await import("../src/lib/config");
  const { getDb, schema } = await import("../src/lib/db/client");
  const { settleEffects } = await import("../src/lib/engine/advance");
  const { startTicker, stopTicker } = await import("../src/lib/engine/ticker");
  const { PRESETS } = await import("../src/lib/presets");
  const { applyHostAction, createRoom } = await import("../src/lib/rooms");

  const db = await getDb();
  await db
    .insert(schema.users)
    .values({ id: DEMO_HOST_ID, displayName: "Demo host", isBot: true })
    .onConflictDoNothing();

  const { room, show } = await createRoom(
    {
      title: "Demo: The Midnight Diamond",
      preset: "heist",
      premise: PRESETS.heist.premise,
      roundsTotal: ROUNDS,
      stormMs: 9000,
      voteMs: 7000,
      autoAdvance: true,
      strictFilter: true,
    },
    { id: DEMO_HOST_ID, displayName: "Demo host", isBot: true },
    { isDemo: true },
  );
  console.log(`Created demo room ${room.code} (show ${show.id}). Running ${ROUNDS} rounds with simulated players...`);

  startTicker();
  await applyHostAction(room, { action: "start" });

  const started = Date.now();
  let last = "";
  for (;;) {
    const [eng] = await db.select().from(schema.engineState).where(eq(schema.engineState.roomId, room.id));
    const [row] = await db.select({ recap: schema.shows.storyRecap }).from(schema.shows).where(eq(schema.shows.id, show.id));
    const label = `round ${eng.roundNo}/${ROUNDS} ${eng.phase}`;
    if (label !== last) console.log(`  ${label}`);
    last = label;
    if (eng.phase === "FINALE" && row?.recap) break;
    if (Date.now() - started > TIMEOUT_MS) throw new Error(`The demo did not reach its finale within ${TIMEOUT_MS / 1000} s (stuck at ${label}).`);
    await new Promise((r) => setTimeout(r, 500));
  }

  await applyHostAction(room, { action: "endShow" });
  await settleEffects();
  stopTicker();

  const base = env().APP_URL.replace(/\/+$/, "");
  const [ideaCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.ideas)
    .innerJoin(schema.rounds, eq(schema.rounds.id, schema.ideas.roundId))
    .where(eq(schema.rounds.showId, show.id));
  const [voteCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.votes)
    .innerJoin(schema.rounds, eq(schema.rounds.id, schema.votes.roundId))
    .where(eq(schema.rounds.showId, show.id));



  console.log(`\nDone: ${ideaCount?.n ?? 0} bot ideas and ${voteCount?.n ?? 0} bot votes over ${ROUNDS} rounds.`);
  console.log(`  Story:  ${base}/story/${show.id}`);
  console.log(`  Screen: ${base}/screen/${room.code}`);
  console.log("This is a demo show: it is labelled, uses simulated players and is not counted on /impact.");

  const holder = (globalThis as unknown as { __cpDb?: { close(): Promise<void> } }).__cpDb;
  await holder?.close().catch(() => undefined);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
