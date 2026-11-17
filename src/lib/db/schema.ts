// FROZEN CONTRACT (TECH_SPEC §4). Generate migrations with `pnpm db:generate` after any change.
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const created = () => ts("created_at").notNull().defaultNow();

export const users = pgTable("users", {
  id: text("id").primaryKey(), // u_<16 alnum> humans, b_<..> bots, cp_narrator
  displayName: text("display_name").notNull(),
  isBot: boolean("is_bot").notNull().default(false),
  nexconnUserId: text("nexconn_user_id"),
  createdAt: created(),
  deletedAt: ts("deleted_at"),
});

export const rooms = pgTable(
  "rooms",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    channelId: text("channel_id").notNull(),
    title: text("title").notNull(),
    hostUserId: text("host_user_id").notNull().references(() => users.id),
    hostKeyHash: text("host_key_hash").notNull(),
    strictFilter: boolean("strict_filter").notNull().default(true),
    isDemo: boolean("is_demo").notNull().default(false),
    /** Judge Mode: the human whose ideas get the wildcard boost. */
    demoUserId: text("demo_user_id"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("rooms_code_uq").on(t.code), index("rooms_host_idx").on(t.hostUserId)],
);

export const shows = pgTable(
  "shows",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id").notNull().references(() => rooms.id),
    premise: text("premise").notNull(),
    preset: text("preset").notNull(), // PresetId
    lang: text("lang").notNull().default("en"),
    roundsTotal: integer("rounds_total").notNull(),
    stormMs: integer("storm_ms").notNull(),
    voteMs: integer("vote_ms").notNull(),
    promptMs: integer("prompt_ms").notNull(),
    revealMs: integer("reveal_ms").notNull(),
    autoAdvance: boolean("auto_advance").notNull().default(true),
    status: text("status").notNull().default("lobby"), // lobby | live | finale | ended
    storyTitle: text("story_title"),
    storySummary: text("story_summary").notNull().default(""),
    storyRecap: text("story_recap"),
    storyTagline: text("story_tagline"),
    startedAt: ts("started_at"),
    endedAt: ts("ended_at"),
    createdAt: created(),
  },
  (t) => [index("shows_room_idx").on(t.roomId)],
);

/** Single row per room, row-locked by advance(). */
export const engineState = pgTable(
  "engine_state",
  {
    roomId: text("room_id")
      .primaryKey()
      .references(() => rooms.id),
    showId: text("show_id")
      .notNull()
      .references(() => shows.id),
    roundNo: integer("round_no").notNull().default(0),
    phase: text("phase").notNull().default("LOBBY"), // Phase
    phaseStartedAt: ts("phase_started_at").notNull().defaultNow(),
    phaseEndsAt: ts("phase_ends_at"),
    pausedRemainingMs: integer("paused_remaining_ms"),
    version: bigint("version", { mode: "number" }).notNull().default(0),
    payload: jsonb("payload").notNull(), // EnginePayload
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  // The ticker scans for passed deadlines every 250 ms; finished and held rooms have none and are never visited.
  (t) => [index("engine_state_deadline_idx").on(t.phaseEndsAt).where(sql`${t.phaseEndsAt} is not null`)],
);

export const rounds = pgTable(
  "rounds",
  {
    id: text("id").primaryKey(),
    showId: text("show_id")
      .notNull()
      .references(() => shows.id),
    roundNo: integer("round_no").notNull(),
    promptTitle: text("prompt_title").notNull(),
    promptText: text("prompt_text").notNull(),
    narratorOptions: jsonb("narrator_options").notNull(), // [string, string, string]
    promptProvider: text("prompt_provider"),
    status: text("status").notNull().default("pending"), // pending | storm | distill | vote | reveal | done
    ideasCount: integer("ideas_count").notNull().default(0),
    contributorsCount: integer("contributors_count").notNull().default(0),
    distillMs: integer("distill_ms"),
    distillProvider: text("distill_provider"),
    fallbackUsed: boolean("fallback_used").notNull().default(false),
    votesCount: integer("votes_count").notNull().default(0),
    winnerOptionId: text("winner_option_id"),
    narration: text("narration"),
    narrationProvider: text("narration_provider"),
    beat: text("beat"),
    ttsUrl: text("tts_url"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("rounds_show_no_uq").on(t.showId, t.roundNo)],
);

export const ideas = pgTable(
  "ideas",
  {
    id: text("id").primaryKey(),
    roundId: text("round_id")
      .notNull()
      .references(() => rounds.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    text: text("text").notNull(),
    clientMsgId: text("client_msg_id").notNull(),
    source: text("source").notNull(), // webhook | post | bot
    status: text("status").notNull().default("ok"), // ok | blocked | deleted
    clusterId: integer("cluster_id"),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("ideas_user_msg_uq").on(t.userId, t.clientMsgId), // also serves lookups by user alone
    index("ideas_round_user_idx").on(t.roundId, t.userId), // also serves lookups by round alone (per-user cap count, my ideas, ban)
  ],
);

export const options = pgTable(
  "options",
  {
    id: text("id").primaryKey(),
    roundId: text("round_id")
      .notNull()
      .references(() => rounds.id),
    slot: text("slot"), // A | B | C for live options; null for backups
    kind: text("kind").notNull(), // crowd | wildcard | narrator
    label: text("label").notNull(),
    sourceIdeaIds: jsonb("source_idea_ids").notNull(), // string[]
    supporters: integer("supporters").notNull().default(0),
    vetoed: boolean("vetoed").notNull().default(false),
    boosted: boolean("boosted").notNull().default(false),
    rank: integer("rank").notNull(), // 1-3 live, 4+ backups
    createdAt: created(),
  },
  (t) => [index("options_round_idx").on(t.roundId)],
);

export const votes = pgTable(
  "votes",
  {
    roundId: text("round_id")
      .notNull()
      .references(() => rounds.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    optionId: text("option_id")
      .notNull()
      .references(() => options.id),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.roundId, t.userId] }), index("votes_option_idx").on(t.optionId)],
);

export const receipts = pgTable(
  "receipts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    showId: text("show_id")
      .notNull()
      .references(() => shows.id),
    roundId: text("round_id")
      .notNull()
      .references(() => rounds.id),
    type: text("type").notNull(), // BALLOT | CANON
    optionId: text("option_id")
      .notNull()
      .references(() => options.id),
    ideaId: text("idea_id")
      .notNull()
      .references(() => ideas.id),
    deliveredNexconn: boolean("delivered_nexconn").notNull().default(false),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("receipts_once_uq").on(t.userId, t.roundId, t.type, t.optionId), // also serves lookups by user alone
    index("receipts_show_type_user_idx").on(t.showId, t.type, t.userId), // canon-maker counts of a show; also serves show alone
  ],
);

export const participants = pgTable(
  "participants",
  {
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    lang: text("lang").notNull().default("en"),
    joinedAt: ts("joined_at").notNull().defaultNow(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    muted: boolean("muted").notNull().default(false),
    banned: boolean("banned").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.roomId, t.userId] }), index("participants_user_idx").on(t.userId)],
);

/** Provider message ids already ingested (webhook dedupe). */
export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(),
  receivedAt: ts("received_at").notNull().defaultNow(),
});

/** Audit + metrics + effect idempotency keys (id = `${roomId}:${roundNo}:${effect}` for effects). */
export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id").references(() => rooms.id),
    type: text("type").notNull(),
    data: jsonb("data"),
    createdAt: created(),
  },
  (t) => [index("events_room_idx").on(t.roomId), index("events_type_idx").on(t.type)],
);

export type UserRow = typeof users.$inferSelect;
export type RoomRow = typeof rooms.$inferSelect;
export type ShowRow = typeof shows.$inferSelect;
export type EngineStateRow = typeof engineState.$inferSelect;
export type RoundRow = typeof rounds.$inferSelect;
export type IdeaRow = typeof ideas.$inferSelect;
export type OptionRow = typeof options.$inferSelect;
export type VoteRow = typeof votes.$inferSelect;
export type ReceiptRow = typeof receipts.$inferSelect;
export type ParticipantRow = typeof participants.$inferSelect;
