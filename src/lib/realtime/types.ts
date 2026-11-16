// FROZEN CONTRACT (Phase 2). Shared by server, client, mock and Nexconn adapters.
// Changing anything here requires updating every adapter + docs/DECISIONS.md.
// This file must stay free of Node-only and Nexconn imports: it is bundled into the client.

export type Phase = "LOBBY" | "PROMPT" | "STORM" | "DISTILL" | "VOTE" | "REVEAL" | "FINALE" | "ENDED";
export type OptionSlot = "A" | "B" | "C";
export type OptionKind = "crowd" | "wildcard" | "narrator";
export type PresetId = "heist" | "fantasy" | "space" | "mystery" | "classroom" | "custom";
export type ReceiptType = "BALLOT" | "CANON";

/** A credited contributor. Names always come from the database, never from a model. */
export type Credit = { name: string; bot: boolean };

export type PublicOption = {
  id: string;
  slot: OptionSlot;
  kind: OptionKind;
  label: string;
  /** Number of ideas behind this option (computed server-side). */
  supporters: number;
  /** Up to 3 contributor names. */
  credit: Credit[];
  /** Contributors beyond `credit`. */
  more: number;
  /** Judge Mode only: wildcard came from the human judge's boosted idea. */
  boosted?: boolean;
};

export type PublicOutcome = {
  optionId: string;
  /** null until the narrator finishes (≤5 s, then a template). */
  narration: string | null;
  credit: Credit[];
  more: number;
  ttsUrl?: string;
};

export type PublicFinale = {
  storyTitle: string;
  recap: string;
  tagline: string;
  canonMakers: { name: string; bot: boolean; count: number }[];
};

export type PublicStats = { players: number; ideasThisRound: number; ideasTotal: number; canonMakers: number };

export type I18nBundle = {
  prompt?: { title: string; text: string };
  options?: Record<string, string>; // optionId -> label
  narration?: string;
};

/** The single state shape used for Nexconn metadata, CP:State messages and HTTP. */
export type PublicState = {
  v: number;
  roomCode: string;
  showId: string;
  phase: Phase;
  roundNo: number;
  roundsTotal: number;
  phaseStartedAt: number;
  phaseEndsAt: number | null;
  serverNow: number;
  paused: boolean;
  title: string;
  premise: string;
  preset: PresetId;
  isDemo: boolean;
  prompt?: { title: string; text: string };
  options?: PublicOption[];
  tally?: Record<string, number>; // optionId -> votes
  votesTotal?: number;
  outcome?: PublicOutcome;
  finale?: PublicFinale;
  stats: PublicStats;
  storySoFar: string[]; // last 3 one-line beats
  i18n?: Record<string, I18nBundle>; // FEATURE_MULTILINGUAL only
};

// ---------- Message payloads (NEXCONN_INTEGRATION.md §4) ----------

export const OBJECT_NAMES = {
  idea: "CP:Idea",
  cheer: "CP:Cheer",
  state: "CP:State",
  tally: "CP:Tally",
  moderation: "CP:Moderation",
  notice: "CP:Notice",
  receipt: "CP:Receipt",
} as const;
export type ObjectName = (typeof OBJECT_NAMES)[keyof typeof OBJECT_NAMES];

export const NARRATOR_USER_ID = "cp_narrator";
export const channelIdForRoom = (code: string) => `cp_${code}`;

export type IdeaPayload = {
  t: "idea";
  roundNo: number;
  text: string;
  clientMsgId: string;
  name: string;
  isBot?: boolean;
};
export type CheerPayload = { t: "cheer"; emoji: string; name?: string; isBot?: boolean };
export type TallyPayload = { t: "tally"; v: number; roundNo: number; tally: Record<string, number>; total: number };
export type ModerationPayload = {
  t: "mod";
  /** Hide specific ideas (identified the way clients see them: sender + clientMsgId). */
  hide?: { userId: string; clientMsgId: string }[];
  /** Hide every idea from these users (ban). */
  hideUserIds?: string[];
  notice?: string;
};
export type NoticePayload = { t: "notice"; text: string };
export type ReceiptPayload = {
  t: "receipt";
  type: ReceiptType;
  showId: string;
  roundNo: number;
  optionId: string;
  optionLabel: string;
  ideaText: string;
};

/** Messages the server sends into a room through sendRoomMessage (bots, narrator notices, moderation). */
export type RoomMessage = IdeaPayload | CheerPayload | NoticePayload | ModerationPayload;

/** A message the server learned about from the provider (webhook) or the mock bus. */
export type IncomingMessage = {
  providerMsgId: string;
  channelId: string;
  fromUserId: string;
  objectName: string;
  payload: unknown; // validate with zod before use: it is untrusted
  sentAt: number;
};

// ---------- Adapter interfaces (NEXCONN_INTEGRATION.md §3) ----------

export interface RealtimeServer {
  readonly kind: "mock" | "nexconn";
  ensureUser(u: { id: string; name: string }): Promise<{ token: string }>;
  ensureChannel(channelId: string, name: string): Promise<void>;
  /** Idempotent, safe to fail (logs and resolves). */
  configurePriorities(): Promise<void>;
  publishState(channelId: string, state: PublicState, opts: { phaseChanged: boolean }): Promise<void>;
  publishTally(channelId: string, v: number, roundNo: number, tally: Record<string, number>, total: number): Promise<void>;
  sendRoomMessage(channelId: string, fromUserId: string, msg: RoomMessage): Promise<void>;
  /** Returns true when delivered through the provider; the DB row is written regardless. */
  sendReceipt(toUserId: string, receipt: ReceiptPayload): Promise<boolean>;
  moderate(channelId: string, userId: string, action: "mute" | "ban" | "unmute" | "unban"): Promise<void>;
  countParticipants(channelId: string): Promise<number | null>;
  /** null = reject (bad signature / stale timestamp / unparseable). */
  verifyWebhook(req: Request, rawBody: string): Promise<IncomingMessage[] | null>;
  destroyChannel(channelId: string): Promise<void>;
}

export type ConnectionStatus = "connected" | "connecting" | "disconnected";
export type Unsub = () => void;

export type ClientEvents = {
  state: PublicState;
  /** Partial state assembled from Open Channel metadata; apply only if v >= current v. */
  patch: { v: number; fields: Partial<PublicState> };
  tally: TallyPayload;
  idea: IdeaPayload & { userId: string };
  cheer: CheerPayload & { userId: string };
  moderation: ModerationPayload;
  receipt: ReceiptPayload;
  notice: NoticePayload;
  connection: ConnectionStatus;
};

export type ClientCreds = {
  mode: "mock" | "nexconn";
  userId: string;
  appKey?: string;
  token?: string;
  area?: string;
};

export interface RealtimeClient {
  connect(creds: ClientCreds): Promise<void>;
  joinRoom(channelId: string): Promise<void>;
  leaveRoom(channelId: string): Promise<void>;
  sendIdea(channelId: string, p: IdeaPayload): Promise<void>;
  sendCheer(channelId: string, emoji: string): Promise<void>;
  on<K extends keyof ClientEvents>(ev: K, cb: (p: ClientEvents[K]) => void): Unsub;
  disconnect(): Promise<void>;
}

// ---------- Open Channel metadata encoding (NEXCONN_INTEGRATION.md §5) ----------

export const META_KEYS = ["cp.phase", "cp.prompt", "cp.options", "cp.tally", "cp.outcome", "cp.stats", "cp.story"] as const;
export type MetaKey = (typeof META_KEYS)[number];

/** Split a PublicState into metadata values (JSON strings, each carrying v). */
export function encodeMetadata(s: PublicState): Record<MetaKey, string> {
  const v = s.v;
  return {
    "cp.phase": JSON.stringify({
      v,
      phase: s.phase,
      roundNo: s.roundNo,
      roundsTotal: s.roundsTotal,
      phaseStartedAt: s.phaseStartedAt,
      phaseEndsAt: s.phaseEndsAt,
      serverNow: s.serverNow,
      paused: s.paused,
      showId: s.showId,
      title: s.title,
    }),
    "cp.prompt": JSON.stringify({ v, ...(s.prompt ?? {}) }),
    "cp.options": JSON.stringify({ v, options: s.options ?? [] }),
    "cp.tally": JSON.stringify({ v, tally: s.tally ?? {}, total: s.votesTotal ?? 0 }),
    "cp.outcome": JSON.stringify({ v, ...(s.outcome ?? {}) }),
    "cp.stats": JSON.stringify({ v, ...s.stats }),
    "cp.story": JSON.stringify({ v, beats: s.storySoFar }),
  };
}

/** Inverse of encodeMetadata for whichever keys are present. Unknown/invalid keys are skipped. */
export function decodeMetadata(kv: Record<string, string>): { v: number; fields: Partial<PublicState> } | null {
  let v = -1;
  const fields: Partial<PublicState> = {};
  const read = (k: MetaKey): Record<string, unknown> | null => {
    const raw = kv[k];
    if (typeof raw !== "string") return null;
    try {
      const o = JSON.parse(raw) as Record<string, unknown>;
      if (typeof o.v === "number") v = Math.max(v, o.v);
      return o;
    } catch {
      return null;
    }
  };
  const ph = read("cp.phase");
  if (ph) {
    Object.assign(fields, {
      phase: ph.phase,
      roundNo: ph.roundNo,
      roundsTotal: ph.roundsTotal,
      phaseStartedAt: ph.phaseStartedAt,
      phaseEndsAt: ph.phaseEndsAt,
      serverNow: ph.serverNow,
      paused: ph.paused,
      showId: ph.showId,
      title: ph.title,
    } as Partial<PublicState>);
  }
  const pr = read("cp.prompt");
  if (pr && typeof pr.title === "string") fields.prompt = { title: pr.title, text: String(pr.text ?? "") };
  const op = read("cp.options");
  if (op && Array.isArray(op.options)) fields.options = op.options as PublicOption[];
  const ta = read("cp.tally");
  if (ta) {
    fields.tally = (ta.tally ?? {}) as Record<string, number>;
    fields.votesTotal = Number(ta.total ?? 0);
  }
  const oc = read("cp.outcome");
  if (oc && typeof oc.optionId === "string") fields.outcome = oc as unknown as PublicOutcome;
  const st = read("cp.stats");
  if (st) {
    fields.stats = {
      players: Number(st.players ?? 0),
      ideasThisRound: Number(st.ideasThisRound ?? 0),
      ideasTotal: Number(st.ideasTotal ?? 0),
      canonMakers: Number(st.canonMakers ?? 0),
    };
  }
  const sy = read("cp.story");
  if (sy && Array.isArray(sy.beats)) fields.storySoFar = sy.beats as string[];
  return v < 0 ? null : { v, fields };
}
