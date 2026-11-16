// FROZEN CONTRACT: HTTP request bodies (zod) and response shapes. Safe to import on the client.
import { z } from "zod";
import type { Features } from "../config";
import type { PresetId, PublicState, ReceiptType } from "../realtime/types";

export const PRESET_IDS = ["heist", "fantasy", "space", "mystery", "classroom", "custom"] as const satisfies readonly PresetId[];

export type Ok<T> = { ok: true } & T;
export type Err = { ok: false; code: string; message: string };
export type ApiResult<T> = Ok<T> | Err;

// ---- POST /api/session ----
export const SessionBody = z.object({
  displayName: z.string().trim().min(2).max(20),
  lang: z.string().min(2).max(10).optional(),
});
export type SessionRes = Ok<{
  user: { id: string; displayName: string };
  /** Same JWT as the cookie; stored in localStorage only as a cookies-blocked fallback (x-cp-session). */
  sessionToken: string;
  realtime: { mode: "mock" | "nexconn"; appKey?: string; token?: string; area?: string };
  features: Features;
}>;

// ---- POST /api/rooms ----
export const CreateRoomBody = z.object({
  title: z.string().trim().min(2).max(60),
  preset: z.enum(PRESET_IDS),
  premise: z.string().trim().min(10).max(400),
  roundsTotal: z.number().int().min(3).max(10),
  // UI offers 20/30/45 s storm and 10/12/20 s vote; the API accepts any value in range (tests use short ones).
  stormMs: z.number().int().min(3000).max(120000),
  voteMs: z.number().int().min(3000).max(60000),
  autoAdvance: z.boolean().default(true),
  strictFilter: z.boolean().default(true),
});
export type CreateRoomInput = z.infer<typeof CreateRoomBody>;
export type RoomLinks = { join: string; play: string; screen: string; obs: string; host: string };
export type CreateRoomRes = Ok<{ code: string; showId: string; hostKey: string; links: RoomLinks }>;

// ---- GET /api/rooms/:code ----
export type RoomInfoRes = Ok<{
  room: {
    code: string;
    title: string;
    hostName: string;
    players: number;
    phase: PublicState["phase"];
    showId: string;
    isDemo: boolean;
    full: boolean;
  };
}>;

// ---- POST /api/rooms/:code/join ----
export const JoinBody = z.object({ lang: z.string().min(2).max(10).optional() }).default({});
export type MeInRoom = {
  userId: string;
  displayName: string;
  vote: string | null; // optionId for the current round
  muted: boolean;
  banned: boolean;
  /** Current-round option ids my ideas feed ("✨ Yours"). */
  myOptionIds: string[];
  ideasThisRound: number;
};
export type JoinRes = Ok<{ state: PublicState; me: MeInRoom; channelId: string }>;

// ---- GET /api/rooms/:code/state ----
export type StateRes = Ok<{ state: PublicState }>;

// ---- POST /api/rooms/:code/ideas ----
export const IdeaBody = z.object({
  roundNo: z.number().int().min(1),
  text: z.string().max(400), // trimmed + 140-char rule enforced by ingest (gives a friendly code)
  clientMsgId: z.string().min(8).max(64),
});
export const IDEA_REJECT_CODES = [
  "NOT_STORM",
  "WRONG_ROUND",
  "EMPTY",
  "TOO_LONG",
  "RATE_LIMITED",
  "ROUND_CAP",
  "BLOCKED",
  "MUTED",
  "BANNED",
  "NOT_PARTICIPANT",
] as const;
export type IdeaRejectCode = (typeof IDEA_REJECT_CODES)[number];
export type IdeaRes = Ok<{ ideaId: string; duplicate: boolean }> | { ok: false; code: IdeaRejectCode; message: string; retryInMs?: number };

// ---- POST /api/rooms/:code/vote ----
export const VoteBody = z.object({ roundNo: z.number().int().min(1), optionId: z.string().min(1) });
export type VoteRes = Ok<{ optionId: string }>;

// ---- POST /api/rooms/:code/host  (header x-host-key) ----
export const HostAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("next") }),
  z.object({ action: z.literal("endStorm") }),
  z.object({ action: z.literal("extend"), ms: z.number().int().min(1000).max(60000).default(10000) }),
  z.object({ action: z.literal("pause") }),
  z.object({ action: z.literal("resume") }),
  z.object({ action: z.literal("forceWin"), optionId: z.string().min(1) }),
  z.object({ action: z.literal("veto"), optionId: z.string().min(1) }),
  z.object({ action: z.literal("reroll") }),
  z.object({ action: z.literal("endShow") }),
  z.object({ action: z.literal("autoAdvance"), on: z.boolean() }),
  z.object({ action: z.literal("strictFilter"), on: z.boolean() }),
  z.object({ action: z.literal("voice"), on: z.boolean() }),
  z.object({ action: z.literal("deleteIdea"), ideaId: z.string().min(1) }),
  z.object({ action: z.literal("mute"), userId: z.string().min(1), on: z.boolean() }),
  z.object({ action: z.literal("ban"), userId: z.string().min(1), on: z.boolean() }),
  z.object({ action: z.literal("heartbeat") }),
]);
export type HostActionInput = z.infer<typeof HostAction>;
export type HostRes = Ok<{ state: PublicState }>;

// ---- GET /api/rooms/:code/host/feed ----
export type HostFeedIdea = {
  id: string;
  userId: string;
  name: string;
  isBot: boolean;
  text: string;
  status: "ok" | "blocked" | "deleted";
  createdAt: number;
};
export type HostFeedPlayer = {
  userId: string;
  name: string;
  isBot: boolean;
  muted: boolean;
  banned: boolean;
  lastSeenAt: number;
  ideas: number;
};
export type HostMetrics = {
  connected: number;
  ideasThisRound: number;
  distillMs: number | null;
  distillProvider: string | null;
  fallbackUsed: boolean;
  rerollUsed: boolean;
  autoAdvance: boolean;
  strictFilter: boolean;
  voice: boolean;
};
export type HostFeedRes = Ok<{ state: PublicState; ideas: HostFeedIdea[]; players: HostFeedPlayer[]; metrics: HostMetrics; links: RoomLinks }>;

// ---- POST /api/try ----
export const TryBody = z.object({ displayName: z.string().trim().min(2).max(20).optional() }).default({});
export type TryRes = Ok<{ code: string; showId: string }>;

// ---- GET /api/me ----
export type MeReceipt = {
  id: string;
  type: ReceiptType;
  showId: string;
  showTitle: string;
  roundNo: number;
  optionLabel: string;
  ideaText: string;
  createdAt: number;
};
export type MeRes = Ok<{
  user: { id: string; displayName: string };
  receipts: MeReceipt[];
  stats: { ideas: number; ballots: number; canon: number; shows: number };
}>;

// ---- GET /api/story/:showId ----
export type StoryRound = {
  roundNo: number;
  prompt: { title: string; text: string };
  winner: { label: string; kind: string } | null;
  narration: string | null;
  credit: { name: string; bot: boolean }[];
  more: number;
};
export type StoryRes = Ok<{
  show: {
    id: string;
    roomCode: string;
    title: string;
    storyTitle: string | null;
    premise: string;
    preset: PresetId;
    isDemo: boolean;
    recap: string | null;
    tagline: string | null;
    status: string;
    startedAt: number | null;
    endedAt: number | null;
  };
  rounds: StoryRound[];
  canonMakers: { name: string; bot: boolean; count: number }[];
}>;

// ---- GET /api/impact ----
export type ImpactRes = Ok<{
  totals: {
    realPeople: number;
    showsCompleted: number;
    ideas: number;
    canonMakers: number;
    medianDistillMs: number | null;
    p95DistillMs: number | null;
    fallbackRate: number | null;
  };
  sessions: { showId: string; title: string; date: number; people: number; ideas: number; rounds: number }[];
  generatedAt: number;
}>;

// ---- GET /api/health, /api/time ----
export type HealthRes = { ok: boolean; realtimeMode: "mock" | "nexconn"; llmMode: "mock" | "live"; db: "pg" | "pglite"; version: string };
export type TimeRes = { now: number };
