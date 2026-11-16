// Shared fixtures for the engine integration tests: a recording fake transport, deterministic AI fakes,
// a fake engine clock and small helpers. Not a test file (the vitest include only matches *.test.ts).
import { and, eq } from "drizzle-orm";
import type { RoomLinks } from "@/lib/api/contracts";
import { signSession, type SessionUser } from "@/lib/auth/session";
import { schema, type Db } from "@/lib/db/client";
import { newUserId } from "@/lib/ids";
import type { DistillIdea, DistillInput, DistillResult, FinaleInput, NarrateInput, PromptInput } from "@/lib/ai/types";
import type {
  ModerationPayload,
  PresetId,
  PublicState,
  ReceiptPayload,
  RealtimeServer,
  RoomMessage,
} from "@/lib/realtime/types";

// ---------- recording fake transport ----------

export const rt = {
  states: [] as { channelId: string; state: PublicState; phaseChanged: boolean }[],
  tallies: [] as { channelId: string; v: number; roundNo: number; tally: Record<string, number>; total: number }[],
  messages: [] as { channelId: string; from: string; msg: RoomMessage }[],
  receipts: [] as { userId: string; receipt: ReceiptPayload }[],
  moderation: [] as { channelId: string; userId: string; action: string }[],
  channels: [] as string[],
  failPublish: false,
  failEnsure: false,
  reset() {
    this.failPublish = false;
    this.failEnsure = false;
    this.states.length = 0;
    this.tallies.length = 0;
    this.messages.length = 0;
    this.receipts.length = 0;
    this.moderation.length = 0;
    this.channels.length = 0;
  },
  mods(): ModerationPayload[] {
    return this.messages.map((m) => m.msg).filter((m): m is ModerationPayload => m.t === "mod");
  },
};

export const fakeRealtime: RealtimeServer = {
  kind: "mock",
  async ensureUser(u) {
    return { token: `tok_${u.id}` };
  },
  async ensureChannel(channelId) {
    if (rt.failEnsure) throw new Error("transport down");
    rt.channels.push(channelId);
  },
  async configurePriorities() {},
  async publishState(channelId, state, opts) {
    if (rt.failPublish) throw new Error("transport down");
    rt.states.push({ channelId, state, phaseChanged: opts.phaseChanged });
  },
  async publishTally(channelId, v, roundNo, tally, total) {
    rt.tallies.push({ channelId, v, roundNo, tally, total });
  },
  async sendRoomMessage(channelId, from, msg) {
    rt.messages.push({ channelId, from, msg });
  },
  async sendReceipt(userId, receipt) {
    rt.receipts.push({ userId, receipt });
    return true;
  },
  async moderate(channelId, userId, action) {
    rt.moderation.push({ channelId, userId, action });
  },
  async countParticipants() {
    return null;
  },
  async verifyWebhook() {
    return null;
  },
  async destroyChannel() {},
};

export const realtimeModule = () => ({ getRealtimeServer: () => fakeRealtime });

// ---------- deterministic AI fakes ----------

export const ai = {
  distill: "ok" as "ok" | "throw-full" | "throw-all" | "hang" | "malformed" | "inflate" | "unsafe" | "defer",
  /** In defer mode the full run parks here until the test calls release(). */
  release: (() => {}) as () => void,
  finale: "ok" as "ok" | "throw",
  /** Ids of ideas from other rounds / made-up ids the "model" claims as sources in inflate mode. */
  foreignIds: [] as string[],
  distillCalls: [] as DistillInput[],
  narrateCalls: [] as NarrateInput[],
  finaleCalls: [] as FinaleInput[],
  promptCalls: [] as PromptInput[],
  reset() {
    this.distill = "ok";
    this.release = () => {};
    this.finale = "ok";
    this.foreignIds = [];
    this.distillCalls.length = 0;
    this.narrateCalls.length = 0;
    this.finaleCalls.length = 0;
    this.promptCalls.length = 0;
  },
};

/** Groups ideas by identical text; the biggest groups become A and B, the third C (wildcard). */
export async function fakeDistill(input: DistillInput): Promise<DistillResult> {
  ai.distillCalls.push(input);
  if (ai.distill === "hang" && !input.heuristicOnly) return new Promise<DistillResult>(() => {});
  if (ai.distill === "throw-full" && !input.heuristicOnly) throw new Error("LLM exploded");
  if (ai.distill === "throw-all") throw new Error("everything exploded");
  if (ai.distill === "malformed" && !input.heuristicOnly) {
    return { options: [{ kind: "crowd", label: "only one", sourceIdeaIds: [] }], backups: [], provider: "mock" } as unknown as DistillResult;
  }
  const groups = new Map<string, DistillIdea[]>();
  for (const idea of [...input.ideas].sort((a, b) => a.createdAt - b.createdAt)) {
    const k = idea.text.trim().toLowerCase();
    groups.set(k, [...(groups.get(k) ?? []), idea]);
  }
  const exclude = new Set((input.excludeLabels ?? []).map((l) => l.toLowerCase()));
  const clusters = [...groups.values()]
    .sort((a, b) => b.length - a.length || a[0].createdAt - b[0].createdAt)
    .filter((c) => !exclude.has(c[0].text.toLowerCase()));
  const crowd = (c: DistillIdea[], kind: "crowd" | "wildcard") => ({
    kind,
    label: c[0].text.slice(0, 70),
    sourceIdeaIds: c.map((i) => i.id),
  });
  const slot = (i: number, kind: "crowd" | "wildcard") =>
    clusters[i] ? crowd(clusters[i], kind) : { kind: "narrator" as const, label: input.narratorOptions[i], sourceIdeaIds: [] as string[] };
  const clusterOf: Record<string, number> = {};
  clusters.forEach((c, n) => c.forEach((i) => (clusterOf[i.id] = n)));
  const options = [slot(0, "crowd"), slot(1, "crowd"), slot(2, "wildcard")] as DistillResult["options"];
  if (ai.distill === "inflate" && !input.heuristicOnly) {
    options[0] = { ...options[0], sourceIdeaIds: [...options[0].sourceIdeaIds, "ghost_1", "ghost_2", ...ai.foreignIds] };
  }
  const unsafeIdeaIds = ai.distill === "unsafe" && !input.heuristicOnly && options[0].sourceIdeaIds[0] ? [options[0].sourceIdeaIds[0]] : [];
  const result: DistillResult = {
    options,
    backups: clusters.slice(3, 6).map((c) => crowd(c, "crowd")),
    unsafeIdeaIds,
    clusterOf,
    provider: input.heuristicOnly ? "heuristic" : "mock",
    ms: 1,
    fallbackUsed: Boolean(input.heuristicOnly),
  };
  if (ai.distill === "defer" && !input.heuristicOnly) {
    return new Promise<DistillResult>((resolve) => {
      ai.release = () => resolve(result);
    });
  }
  return result;
}

export const distillModule = () => ({ distillRound: fakeDistill });

export const narrateModule = () => ({
  narrateOutcome: async (input: NarrateInput) => {
    ai.narrateCalls.push(input);
    const flavour = input.sourceIdeas[0] ? ` Inspired by: ${input.sourceIdeas[0]}.` : "";
    return {
      narration: `The crowd chose "${input.winnerLabel}".${flavour}`,
      beat: `Beat ${input.story.roundNo}: ${input.winnerLabel}`,
      summary: `${input.story.summary} ${input.winnerLabel}`.trim(),
      provider: "mock" as const,
      ms: 1,
      fallbackUsed: false,
    };
  },
});

const scene = (n: number) => ({
  title: `Scene ${n}`,
  text: `What happens in scene ${n}?`,
  narratorOptions: [`Scene ${n}: go left`, `Scene ${n}: go right`, `Scene ${n}: wait and see`] as [string, string, string],
});

export const promptsModule = () => ({
  generatePrompt: async (input: PromptInput) => {
    ai.promptCalls.push(input);
    return { ...scene(input.story.roundNo), provider: "mock" as const, ms: 1, fallbackUsed: false };
  },
  fallbackPrompt: (input: PromptInput) => ({
    ...scene(input.story.roundNo),
    provider: "template" as const,
    ms: 0 as const,
    fallbackUsed: true,
  }),
});

export const finaleModule = () => ({
  generateFinale: async (input: FinaleInput) => {
    ai.finaleCalls.push(input);
    if (ai.finale === "throw") throw new Error("finale model down");
    return {
      storyTitle: "The Test Saga",
      recap: input.beats.join(" | ") || "A quiet night.",
      tagline: "Written by everyone.",
      provider: "mock" as const,
      ms: 1,
      fallbackUsed: false,
    };
  },
});

export const botCalls = { starts: [] as [string, number][], votes: [] as [string, number][] };
export const botsModule = () => ({
  startBots: async (roomId: string, roundNo: number) => {
    botCalls.starts.push([roomId, roundNo]);
  },
  startBotVotes: async (roomId: string, roundNo: number) => {
    botCalls.votes.push([roomId, roundNo]);
  },
  stopBots: () => {},
});

export const presetsModule = () => {
  const ids: PresetId[] = ["heist", "fantasy", "space", "mystery", "classroom", "custom"];
  const PRESETS = Object.fromEntries(
    ids.map((id) => [
      id,
      {
        id,
        name: id,
        emoji: "*",
        premise: `Premise of ${id}`,
        tone: "fun",
        round1: { title: `Opening: ${id}`, text: `The ${id} begins. What do you do first?`, narratorOptions: [`${id}: act`, `${id}: wait`, `${id}: run`] },
        starters: ["a", "b", "c"],
      },
    ]),
  );
  return { PRESETS };
};

// ---------- fake engine clock ----------

export const T0 = 1_800_000_000_000;
export const clock = {
  now: T0,
  set(ms: number) {
    this.now = ms;
    return ms;
  },
};

// ---------- users, requests, rows ----------

export type TestUser = SessionUser & { token: string };

export async function makeUser(db: Db, name: string, isBot = false): Promise<TestUser> {
  const id = newUserId();
  await db.insert(schema.users).values({ id, displayName: name, isBot });
  return { id, displayName: name, isBot, token: await signSession(id) };
}

export function req(url: string, init: { method?: string; user?: TestUser; hostKey?: string; body?: unknown } = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.user) headers.cookie = `cp_session=${init.user.token}`;
  if (init.hostKey) headers["x-host-key"] = init.hostKey;
  return new Request(`http://localhost${url}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

export const ctx = (code: string) => ({ params: Promise.resolve({ code }) });

export type CreatedRoom = { code: string; showId: string; hostKey: string; links: RoomLinks; roomId: string };

type Handler = (req: Request, c: { params: Promise<{ code: string }> }) => Promise<Response>;

/** Call a route handler and return status + parsed JSON body. */
export async function call<T = Record<string, unknown>>(handler: Handler, request: Request, code = ""): Promise<{ status: number; body: T }> {
  const res = await handler(request, ctx(code));
  return { status: res.status, body: (await res.json()) as T };
}

export async function roundRow(db: Db, showId: string, roundNo: number) {
  const [r] = await db
    .select()
    .from(schema.rounds)
    .where(and(eq(schema.rounds.showId, showId), eq(schema.rounds.roundNo, roundNo)));
  return r;
}

export async function addIdea(db: Db, showId: string, roundNo: number, userId: string, text: string, atMs: number) {
  const round = await roundRow(db, showId, roundNo);
  if (!round) throw new Error(`no round ${roundNo}`);
  const id = `idea_${Math.random().toString(36).slice(2, 12)}`;
  await db.insert(schema.ideas).values({
    id,
    roundId: round.id,
    userId,
    text,
    clientMsgId: `cm_${id}`,
    source: "post",
    createdAt: new Date(atMs),
  });
  return id;
}

export async function engineRow(db: Db, roomId: string) {
  const [r] = await db.select().from(schema.engineState).where(eq(schema.engineState.roomId, roomId));
  return r;
}

/** Queue of room codes the (mocked) generator hands out before falling back to random ones. */
// On globalThis because the mock factory for "@/lib/ids" runs while this module is still loading (ids <- harness).
export const codes = ((globalThis as unknown as { __cpTestCodes?: { queue: string[] } }).__cpTestCodes ??= { queue: [] });
