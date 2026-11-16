// Room state store: ONE pure reducer, no React and no I/O, so every merge rule is unit-testable.
//
// Merge rules (TECH_SPEC §5.5, NEXCONN_INTEGRATION §5):
//   state   full PublicState (HTTP or CP:State) is accepted when v >= current v
//   patch   metadata fields are merged when v >= current v; a new round clears last round's
//           options/tally/outcome so nothing stale survives the round change
//   tally   applied when tally.v >= state.v AND tally.roundNo === state.roundNo
//   ideas   feed holds the current round only, capped at FEED_CAP, deduped by userId+clientMsgId,
//           own optimistic bubbles reconcile with the server's answer, and every incoming idea
//           passes the client pre-filter isClean() first
//   moderation hides by {userId, clientMsgId} and by hideUserIds, and stays hidden if the idea
//           arrives late
import type { MeInRoom } from "@/lib/api/contracts";
import { isClean } from "@/lib/ingest/filter";
import type {
  CheerPayload,
  IdeaPayload,
  ModerationPayload,
  PublicState,
  ReceiptPayload,
  TallyPayload,
} from "@/lib/realtime/types";

export const FEED_CAP = 200;
export const CHEER_CAP = 40;
const MAX_IDEA_CHARS = 400;
const MAX_NAME_CHARS = 40;

export type FeedStatus = "pending" | "sent" | "rejected";

export type FeedIdea = {
  /** `${userId}:${clientMsgId}`, stable across the optimistic bubble and the server echo. */
  key: string;
  userId: string;
  clientMsgId: string;
  name: string;
  text: string;
  roundNo: number;
  isBot: boolean;
  mine: boolean;
  status: FeedStatus;
  /** Why the server refused it (an IdeaRejectCode or NETWORK) when status is "rejected". */
  rejectCode?: string;
  at: number;
};

export type CheerItem = { id: string; userId: string; emoji: string; name?: string; isBot: boolean; at: number };

export type RoomStore = {
  state: PublicState | null;
  me: MeInRoom | null;
  meId: string | null;
  meName: string | null;
  feed: FeedIdea[];
  /** Round the feed belongs to. */
  feedRound: number;
  cheers: CheerItem[];
  cheerSeq: number;
  hiddenKeys: Record<string, true>;
  hiddenUsers: Record<string, true>;
  /** Highest v seen on any message, including tallies that did not carry a full state. */
  seenV: number;
};

export type IncomingIdea = IdeaPayload & { userId: string };

export type RoomAction =
  | { type: "state"; state: PublicState }
  | { type: "patch"; v: number; fields: Partial<PublicState> }
  | { type: "tally"; tally: TallyPayload }
  | { type: "ideas"; items: IncomingIdea[]; now: number }
  | { type: "ideaPending"; clientMsgId: string; text: string; name: string; now: number }
  | { type: "ideaResult"; clientMsgId: string; ok: true }
  | { type: "ideaResult"; clientMsgId: string; ok: false; code: string }
  | { type: "moderation"; mod: ModerationPayload }
  | { type: "cheer"; cheer: CheerPayload & { userId: string }; now: number }
  | { type: "receipt"; receipt: ReceiptPayload }
  | { type: "me"; me: MeInRoom }
  | { type: "vote"; optionId: string | null }
  | { type: "identity"; userId: string; name: string }
  | { type: "reset" };

export function initialStore(): RoomStore {
  return {
    state: null,
    me: null,
    meId: null,
    meName: null,
    feed: [],
    feedRound: 0,
    cheers: [],
    cheerSeq: 0,
    hiddenKeys: {},
    hiddenUsers: {},
    seenV: -1,
  };
}

export const feedKey = (userId: string, clientMsgId: string): string => `${userId}:${clientMsgId}`;

/** True when a tally or patch arrived for a newer version than the full state we hold. */
export function needsResync(s: RoomStore): boolean {
  return s.state !== null && s.seenV > s.state.v;
}

const capFeed = (feed: FeedIdea[]): FeedIdea[] => (feed.length > FEED_CAP ? feed.slice(feed.length - FEED_CAP) : feed);

function stripUndefined<T extends object>(o: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] !== undefined) out[k] = o[k];
  return out;
}

/** What changes for me when the round number moves on. */
function withRoundAdvanced(s: RoomStore, nextRound: number): RoomStore {
  const me = s.me ? { ...s.me, vote: null, myOptionIds: [], ideasThisRound: 0 } : null;
  return nextRound > s.feedRound ? { ...s, me, feed: [], feedRound: nextRound } : { ...s, me };
}

function applyState(s: RoomStore, next: PublicState): RoomStore {
  const prevRound = s.state?.roundNo;
  let out: RoomStore = { ...s, state: next, seenV: Math.max(s.seenV, next.v) };
  if (prevRound !== undefined && next.roundNo !== prevRound) out = withRoundAdvanced(out, next.roundNo);
  else if (next.roundNo > out.feedRound) out = { ...out, feed: [], feedRound: next.roundNo };
  return out;
}

function applyIdeas(s: RoomStore, items: IncomingIdea[], now: number): RoomStore {
  let feed = s.feed;
  let feedRound = s.feedRound;
  const seen = new Map<string, number>();
  feed.forEach((f, i) => seen.set(f.key, i));
  let touched = false;

  for (const it of items) {
    const key = feedKey(it.userId, it.clientMsgId);
    if (s.hiddenUsers[it.userId] || s.hiddenKeys[key]) continue;
    if (it.roundNo < feedRound) continue;
    const text = typeof it.text === "string" ? it.text.trim() : "";
    if (!text || text.length > MAX_IDEA_CHARS) continue;

    if (it.roundNo > feedRound) {
      feed = [];
      seen.clear();
      feedRound = it.roundNo;
      touched = true;
    }
    const at = seen.get(key);
    if (at !== undefined) {
      const known = feed[at];
      if (known.mine && known.status === "pending") {
        feed = feed.slice();
        feed[at] = { ...known, status: "sent" };
        touched = true;
      }
      continue;
    }
    if (!isClean(text)) continue;

    if (!touched) {
      feed = feed.slice();
      touched = true;
    }
    seen.set(key, feed.length);
    feed.push({
      key,
      userId: it.userId,
      clientMsgId: it.clientMsgId,
      name: String(it.name ?? "").slice(0, MAX_NAME_CHARS) || "Player",
      text,
      roundNo: it.roundNo,
      isBot: Boolean(it.isBot),
      mine: it.userId === s.meId,
      status: "sent",
      at: now,
    });
  }
  if (!touched) return s;
  return { ...s, feed: capFeed(feed), feedRound };
}

export function reduce(s: RoomStore, a: RoomAction): RoomStore {
  switch (a.type) {
    case "state": {
      if (s.state && a.state.v < s.state.v) return s;
      return applyState(s, a.state);
    }

    case "patch": {
      if (!s.state || a.v < s.state.v) return s;
      const fields = stripUndefined(a.fields);
      const roundChanged = fields.roundNo !== undefined && fields.roundNo !== s.state.roundNo;
      const base: PublicState = roundChanged
        ? { ...s.state, prompt: undefined, options: undefined, tally: undefined, votesTotal: undefined, outcome: undefined }
        : s.state;
      const next: PublicState = { ...base, ...fields, v: a.v };
      let out: RoomStore = { ...s, state: next, seenV: Math.max(s.seenV, a.v) };
      if (roundChanged) out = withRoundAdvanced(out, next.roundNo);
      return out;
    }

    case "tally": {
      const st = s.state;
      if (!st || a.tally.roundNo !== st.roundNo || a.tally.v < st.v) return s;
      return {
        ...s,
        state: { ...st, tally: a.tally.tally, votesTotal: a.tally.total },
        seenV: Math.max(s.seenV, a.tally.v),
      };
    }

    case "ideas":
      return applyIdeas(s, a.items, a.now);

    case "ideaPending": {
      if (!s.meId) return s;
      const roundNo = s.state?.roundNo ?? s.feedRound;
      const idea: FeedIdea = {
        key: feedKey(s.meId, a.clientMsgId),
        userId: s.meId,
        clientMsgId: a.clientMsgId,
        name: s.meName ?? "Me",
        text: a.text,
        roundNo,
        isBot: false,
        mine: true,
        status: "pending",
        at: a.now,
      };
      const base = roundNo > s.feedRound ? { ...s, feed: [], feedRound: roundNo } : s;
      return {
        ...base,
        feed: capFeed([...base.feed, idea]),
        me: base.me ? { ...base.me, ideasThisRound: base.me.ideasThisRound + 1 } : base.me,
      };
    }

    case "ideaResult": {
      if (!s.meId) return s;
      const key = feedKey(s.meId, a.clientMsgId);
      const i = s.feed.findIndex((f) => f.key === key);
      if (i < 0) return s;
      const feed = s.feed.slice();
      if (a.ok) {
        feed[i] = { ...feed[i], status: "sent", rejectCode: undefined };
        return { ...s, feed };
      }
      feed[i] = { ...feed[i], status: "rejected", rejectCode: a.code };
      return {
        ...s,
        feed,
        me: s.me ? { ...s.me, ideasThisRound: Math.max(0, s.me.ideasThisRound - 1) } : s.me,
      };
    }

    case "moderation": {
      const hiddenKeys = { ...s.hiddenKeys };
      const hiddenUsers = { ...s.hiddenUsers };
      for (const h of a.mod.hide ?? []) hiddenKeys[feedKey(h.userId, h.clientMsgId)] = true;
      for (const u of a.mod.hideUserIds ?? []) hiddenUsers[u] = true;
      const feed = s.feed.filter((f) => !hiddenKeys[f.key] && !hiddenUsers[f.userId]);
      return { ...s, hiddenKeys, hiddenUsers, feed: feed.length === s.feed.length ? s.feed : feed };
    }

    case "cheer": {
      const seq = s.cheerSeq + 1;
      const item: CheerItem = {
        id: `${a.cheer.userId}:${seq}`,
        userId: a.cheer.userId,
        emoji: a.cheer.emoji,
        name: a.cheer.name,
        isBot: Boolean(a.cheer.isBot),
        at: a.now,
      };
      const cheers = [...s.cheers, item];
      return { ...s, cheerSeq: seq, cheers: cheers.length > CHEER_CAP ? cheers.slice(cheers.length - CHEER_CAP) : cheers };
    }

    case "receipt": {
      const st = s.state;
      if (!s.me || !st || a.receipt.roundNo !== st.roundNo || !a.receipt.optionId) return s;
      if (s.me.myOptionIds.includes(a.receipt.optionId)) return s;
      return { ...s, me: { ...s.me, myOptionIds: [...s.me.myOptionIds, a.receipt.optionId] } };
    }

    case "me":
      return { ...s, me: a.me, meId: a.me.userId, meName: a.me.displayName };

    case "vote":
      return s.me ? { ...s, me: { ...s.me, vote: a.optionId } } : s;

    case "identity":
      return { ...s, meId: a.userId, meName: a.name };

    case "reset":
      return initialStore();
  }
}
