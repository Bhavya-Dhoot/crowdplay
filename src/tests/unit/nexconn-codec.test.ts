import { describe, expect, it } from "vitest";
import {
  CHANNEL_TYPE,
  CP_MESSAGE_REGISTRATIONS,
  METADATA_VALUE_MAX_CHARS,
  assembleMetadata,
  decodeIncoming,
  decodeWireMetadata,
  encodeEnvelope,
  encodeStateMessage,
  mapConnectionStatus,
  objectNameForRoomMessage,
  parseWebhookEnvelope,
  resolveAreaCode,
  unwrapEnvelope,
  wireMetadata,
  wireTallyMetadata,
  type EnvelopeMode,
} from "@/lib/realtime/nexconn.codec";
import {
  NARRATOR_USER_ID,
  OBJECT_NAMES,
  decodeMetadata,
  encodeMetadata,
  type ObjectName,
  type PublicOption,
  type PublicState,
  type ReceiptPayload,
  type RoomMessage,
  type TallyPayload,
} from "@/lib/realtime/types";

const MODES: EnvelopeMode[] = ["custom", "text"];

const option = (slot: "A" | "B" | "C", label = `Option ${slot}`): PublicOption => ({
  id: `opt_${slot}_xxxxxxxxxxxxxxxx`,
  slot,
  kind: slot === "C" ? "wildcard" : "crowd",
  label,
  supporters: 3,
  credit: [{ name: "Alice", bot: false }],
  more: 0,
});

const state = (over: Partial<PublicState> = {}): PublicState => ({
  v: 41,
  roomCode: "ABCDE",
  showId: "show_1",
  phase: "VOTE",
  roundNo: 2,
  roundsTotal: 3,
  phaseStartedAt: 1_700_000_000_000,
  phaseEndsAt: 1_700_000_012_000,
  serverNow: 1_700_000_001_000,
  paused: false,
  title: "The Heist",
  premise: "A bank, a plan",
  preset: "heist",
  isDemo: false,
  prompt: { title: "Round 2", text: "How do they get in?" },
  options: [option("A"), option("B"), option("C")],
  tally: { opt_A_xxxxxxxxxxxxxxxx: 2 },
  votesTotal: 2,
  stats: { players: 5, ideasThisRound: 4, ideasTotal: 9, canonMakers: 1 },
  storySoFar: ["They met", "They planned"],
  ...over,
});

const tally: TallyPayload = { t: "tally", v: 42, roundNo: 2, tally: { a: 3, b: 1 }, total: 4 };
const receipt: ReceiptPayload = { t: "receipt", type: "CANON", showId: "show_1", roundNo: 2, optionId: "opt_A", optionLabel: "Dig a tunnel", ideaText: "Dig a tunnel under the bank" };

const payloads: Record<ObjectName, unknown> = {
  "CP:Idea": { t: "idea", roundNo: 2, text: "Dig a tunnel", clientMsgId: "cm-1", name: "Alice" },
  "CP:Cheer": { t: "cheer", emoji: "🎉", name: "Alice" },
  "CP:State": state(),
  "CP:Tally": tally,
  "CP:Moderation": { t: "mod", hide: [{ userId: "u_x", clientMsgId: "cm-9" }], hideUserIds: ["u_banned"], notice: "Removed" },
  "CP:Notice": { t: "notice", text: "Storm ends in 5 seconds" },
  "CP:Receipt": receipt,
};

const senderFor = (name: ObjectName): string => (name === "CP:Idea" || name === "CP:Cheer" ? "u_alice" : NARRATOR_USER_ID);
const channelTypeFor = (name: ObjectName): number => (name === "CP:Receipt" ? CHANNEL_TYPE.DIRECT : CHANNEL_TYPE.OPEN);

describe("envelope round trip", () => {
  for (const mode of MODES) {
    for (const name of Object.values(OBJECT_NAMES)) {
      it(`${name} survives the ${mode} encoding`, () => {
        const enc = encodeEnvelope(name, payloads[name], mode);
        expect(enc.messageType).toBe(mode === "custom" ? name : "RC:TxtMsg");
        const back = unwrapEnvelope(enc.messageType, enc.content);
        expect(back).toEqual({ objectName: name, payload: JSON.parse(JSON.stringify(payloads[name])) });
      });
    }
  }

  it("text mode carries a readable line in `content` and the JSON in `extra`", () => {
    const enc = encodeEnvelope("CP:Idea", payloads["CP:Idea"], "text");
    const body = JSON.parse(enc.content) as { content: string; extra: string };
    expect(body.content).toBe("Alice: Dig a tunnel");
    expect(JSON.parse(body.extra)).toEqual({ cp: 1, o: "CP:Idea", p: payloads["CP:Idea"] });
  });

  it("accepts the Web SDK shape of a text message ({text, extra}) and an already-parsed custom content object", () => {
    const enc = encodeEnvelope("CP:Notice", payloads["CP:Notice"], "text");
    const body = JSON.parse(enc.content) as { content: string; extra: string };
    expect(unwrapEnvelope("RC:TxtMsg", { text: body.content, extra: body.extra })?.objectName).toBe("CP:Notice");
    expect(unwrapEnvelope("CP:Notice", payloads["CP:Notice"])?.payload).toEqual(payloads["CP:Notice"]);
  });

  it("ignores plain chat text, foreign types, broken JSON and non-object content", () => {
    expect(unwrapEnvelope("RC:TxtMsg", { text: "hello", extra: "" })).toBeNull();
    expect(unwrapEnvelope("RC:TxtMsg", JSON.stringify({ content: "hi", extra: JSON.stringify({ cp: 1, o: "Evil:Type", p: {} }) }))).toBeNull();
    expect(unwrapEnvelope("RC:ImgMsg", "{}")).toBeNull();
    expect(unwrapEnvelope("CP:Idea", "{not json")).toBeNull();
    expect(unwrapEnvelope("CP:Idea", "[1,2]")).toBeNull();
    expect(unwrapEnvelope("CP:Idea", 7)).toBeNull();
  });

  it("objectNameForRoomMessage maps the payload type to the object name", () => {
    const cases: [RoomMessage, ObjectName][] = [
      [{ t: "idea", roundNo: 1, text: "x", clientMsgId: "c", name: "n" }, "CP:Idea"],
      [{ t: "cheer", emoji: "🎉" }, "CP:Cheer"],
      [{ t: "notice", text: "n" }, "CP:Notice"],
      [{ t: "mod", hideUserIds: ["u"] }, "CP:Moderation"],
    ];
    for (const [msg, name] of cases) expect(objectNameForRoomMessage(msg)).toBe(name);
  });

  it("registers every CP:* type for the Web SDK", () => {
    expect(CP_MESSAGE_REGISTRATIONS.map((r) => r.messageType).sort()).toEqual(Object.values(OBJECT_NAMES).sort());
  });
});

describe("decodeIncoming (client side)", () => {
  for (const mode of MODES) {
    for (const name of Object.values(OBJECT_NAMES)) {
      it(`${name} -> the matching ClientEvents event (${mode})`, () => {
        const enc = encodeEnvelope(name, payloads[name], mode);
        const out = decodeIncoming({ messageType: enc.messageType, content: enc.content, senderUserId: senderFor(name), channelType: channelTypeFor(name), channelId: "cp_ABCDE" });
        expect(out).not.toBeNull();
        expect(out?.channelId).toBe("cp_ABCDE");
        const expectedEvent = { "CP:Idea": "idea", "CP:Cheer": "cheer", "CP:State": "state", "CP:Tally": "tally", "CP:Moderation": "moderation", "CP:Notice": "notice", "CP:Receipt": "receipt" }[name];
        expect(out?.event).toBe(expectedEvent);
        const expectedPayload = name === "CP:Idea" || name === "CP:Cheer" ? { ...(payloads[name] as object), userId: "u_alice" } : payloads[name];
        expect(out?.payload).toMatchObject(JSON.parse(JSON.stringify(expectedPayload)));
      });
    }
  }

  const idea = JSON.stringify(payloads["CP:Idea"]);

  it("takes the idea's userId from the sender, never from the body", () => {
    const forged = JSON.stringify({ ...(payloads["CP:Idea"] as object), userId: "u_victim" });
    const out = decodeIncoming({ messageType: "CP:Idea", content: forged, senderUserId: "u_mallory", channelType: CHANNEL_TYPE.OPEN, channelId: "cp_ABCDE" });
    expect(out?.payload).toMatchObject({ userId: "u_mallory" });
  });

  it("drops narrator-only messages that another player sent (state, tally, moderation, notice, receipt)", () => {
    for (const name of ["CP:State", "CP:Tally", "CP:Moderation", "CP:Notice", "CP:Receipt"] as const) {
      const enc = encodeEnvelope(name, payloads[name], "custom");
      const from = decodeIncoming({ messageType: enc.messageType, content: enc.content, senderUserId: "u_mallory", channelType: channelTypeFor(name), channelId: "cp_ABCDE" });
      expect(from, name).toBeNull();
    }
  });

  it("only takes room events from open channels and receipts from direct or system channels", () => {
    expect(decodeIncoming({ messageType: "CP:Idea", content: idea, senderUserId: "u", channelType: CHANNEL_TYPE.DIRECT, channelId: "x" })).toBeNull();
    const r = JSON.stringify(receipt);
    expect(decodeIncoming({ messageType: "CP:Receipt", content: r, senderUserId: NARRATOR_USER_ID, channelType: CHANNEL_TYPE.OPEN, channelId: "x" })).toBeNull();
    expect(decodeIncoming({ messageType: "CP:Receipt", content: r, senderUserId: NARRATOR_USER_ID, channelType: CHANNEL_TYPE.SYSTEM, channelId: "x" })?.event).toBe("receipt");
  });

  it("rejects payloads that fail validation or whose `t` does not match the type", () => {
    const bad = [
      { messageType: "CP:Idea", content: JSON.stringify({ ...(payloads["CP:Idea"] as object), text: "" }) },
      { messageType: "CP:Idea", content: JSON.stringify({ ...(payloads["CP:Idea"] as object), t: "cheer" }) },
      { messageType: "CP:Idea", content: JSON.stringify({ ...(payloads["CP:Idea"] as object), roundNo: "2" }) },
      { messageType: "CP:Cheer", content: JSON.stringify({ t: "cheer", emoji: "x".repeat(100) }) },
    ];
    for (const b of bad) expect(decodeIncoming({ ...b, senderUserId: "u", channelType: CHANNEL_TYPE.OPEN, channelId: "c" })).toBeNull();
    const badState = JSON.stringify({ ...state(), phase: "NOPE" });
    expect(decodeIncoming({ messageType: "CP:State", content: badState, senderUserId: NARRATOR_USER_ID, channelType: CHANNEL_TYPE.OPEN, channelId: "c" })).toBeNull();
    const noStats = { ...state(), stats: undefined };
    expect(decodeIncoming({ messageType: "CP:State", content: JSON.stringify(noStats), senderUserId: NARRATOR_USER_ID, channelType: CHANNEL_TYPE.OPEN, channelId: "c" })).toBeNull();
  });

  it("keeps the optional sections of a full state (options, outcome, finale)", () => {
    const full = state({ outcome: { optionId: "opt_A", narration: "They dug.", credit: [{ name: "Alice", bot: false }], more: 0 } });
    const out = decodeIncoming({ messageType: "CP:State", content: JSON.stringify(full), senderUserId: NARRATOR_USER_ID, channelType: CHANNEL_TYPE.OPEN, channelId: "c" });
    expect(out?.payload).toEqual(full);
  });
});

describe("encodeStateMessage", () => {
  it("returns the state as is when it fits", () => {
    const enc = encodeStateMessage(state(), "custom");
    expect(JSON.parse(enc?.content ?? "null")).toEqual(state());
  });

  it("drops the optional i18n bundles when they are what makes it too large", () => {
    const i18n = { hi: { narration: "x".repeat(9500) } };
    const enc = encodeStateMessage(state({ i18n }), "custom");
    expect(enc).not.toBeNull();
    expect(JSON.parse(enc?.content ?? "{}")).not.toHaveProperty("i18n");
  });

  it("returns null when it cannot fit even without i18n", () => {
    expect(encodeStateMessage(state({ storySoFar: ["y".repeat(10_000)] }), "custom")).toBeNull();
  });
});

describe("metadata on the wire", () => {
  it("is exactly encodeMetadata when every value is small", () => {
    const s = state();
    const { entries, dropped } = wireMetadata(s);
    expect(dropped).toEqual([]);
    expect(entries).toEqual(encodeMetadata(s));
    expect(Object.keys(entries).every((k) => /^[A-Za-z0-9+=_-]{1,128}$/.test(k))).toBe(true);
    expect(decodeWireMetadata(entries)).toEqual(decodeMetadata(encodeMetadata(s)));
  });

  it("wireTallyMetadata is the cp_tally entry encodeMetadata would write", () => {
    const s = state({ v: 42, tally: { a: 3, b: 1 }, votesTotal: 4 });
    expect(wireTallyMetadata(42, { a: 3, b: 1 }, 4).cp_tally).toBe(encodeMetadata(s).cp_tally);
  });

  it("splits cp_options per slot when the whole list is over the value limit, and the client reassembles it", () => {
    const long = (slot: "A" | "B" | "C") => option(slot, `${slot} `.repeat(600).trim());
    const s = state({ options: [long("A"), long("B"), long("C")] });
    expect(encodeMetadata(s).cp_options.length).toBeGreaterThan(METADATA_VALUE_MAX_CHARS);
    const { entries, dropped } = wireMetadata(s);
    expect(dropped).toEqual([]);
    expect(entries).not.toHaveProperty("cp_options");
    expect(Object.keys(entries).filter((k) => k.startsWith("cp_options_")).sort()).toEqual(["cp_options_A", "cp_options_B", "cp_options_C"]);
    expect(Object.values(entries).every((v) => v.length <= METADATA_VALUE_MAX_CHARS)).toBe(true);
    expect(decodeWireMetadata(entries)?.fields.options).toEqual(s.options);
  });

  it("drops (and reports) a value that cannot be made to fit instead of writing something invalid", () => {
    const s = state({ storySoFar: ["z".repeat(METADATA_VALUE_MAX_CHARS + 10)] });
    const { entries, dropped } = wireMetadata(s);
    expect(dropped).toEqual(["cp_story"]);
    expect(entries).not.toHaveProperty("cp_story");
    expect(entries).toHaveProperty("cp_phase");
  });

  it("assembleMetadata ignores incomplete slots and slots older than a whole cp_options entry", () => {
    const slot = (slotName: string, v: number, n = 3) => JSON.stringify({ v, n, option: option(slotName as "A") });
    const incomplete = { cp_options_A: slot("A", 5), cp_options_B: slot("B", 5) };
    expect(assembleMetadata(incomplete)).toEqual(incomplete);
    const stale = { cp_options: JSON.stringify({ v: 9, options: [option("A")] }), cp_options_A: slot("A", 5, 1) };
    expect(assembleMetadata(stale)).toEqual(stale);
    const newer = { cp_options: JSON.stringify({ v: 4, options: [] }), cp_options_A: slot("A", 5, 1) };
    expect(JSON.parse(assembleMetadata(newer).cp_options)).toEqual({ v: 5, options: [option("A")] });
  });
});

describe("parseWebhookEnvelope", () => {
  const msg = (over: Record<string, unknown> = {}) => ({
    userId: "u_alice",
    channelId: "cp_ABCDE",
    channelType: 4,
    messageType: "CP:Idea",
    content: JSON.stringify(payloads["CP:Idea"]),
    time: 1_730_192_400_000,
    messageId: "msg_1",
    os: "Websocket",
    ...over,
  });
  const env = (data: unknown[], type = "message:send") => ({ type, id: "evt_1", time: 1_730_192_400_000, data });

  it("maps a message:send event to an IncomingMessage with the parsed payload", () => {
    expect(parseWebhookEnvelope(env([msg()]))).toEqual([
      { providerMsgId: "msg_1", channelId: "cp_ABCDE", fromUserId: "u_alice", objectName: "CP:Idea", payload: payloads["CP:Idea"], sentAt: 1_730_192_400_000 },
    ]);
  });

  it("decodes the text-envelope encoding to the same CP:Idea", () => {
    const enc = encodeEnvelope("CP:Idea", payloads["CP:Idea"], "text");
    const out = parseWebhookEnvelope(env([msg({ messageType: enc.messageType, content: enc.content })]));
    expect(out?.[0]).toMatchObject({ objectName: "CP:Idea", payload: payloads["CP:Idea"], fromUserId: "u_alice" });
  });

  it("skips other event types, other channel types, our own server sends and non-CP messages without failing the batch", () => {
    expect(parseWebhookEnvelope(env([msg()], "open_channel:operation"))).toEqual([]);
    const out = parseWebhookEnvelope(
      env([
        msg({ channelType: 1 }),
        msg({ os: "Server", messageId: "m2" }),
        msg({ messageType: "RC:TxtMsg", content: JSON.stringify({ content: "hello", extra: "" }), messageId: "m3" }),
        msg({ content: "not json", messageId: "m4" }),
        msg({ messageId: "m5" }),
      ]),
    );
    expect(out?.map((m) => m.providerMsgId)).toEqual(["m5"]);
  });

  it("returns null for something that is not an event envelope", () => {
    expect(parseWebhookEnvelope(null)).toBeNull();
    expect(parseWebhookEnvelope({ type: "message:send" })).toBeNull();
    expect(parseWebhookEnvelope({ type: 1, data: [] })).toBeNull();
    expect(parseWebhookEnvelope("nope")).toBeNull();
  });
});

describe("small client helpers", () => {
  it("maps the numeric SDK ConnectionStatus", () => {
    expect([0, 1, 2, 3, 99].map(mapConnectionStatus)).toEqual(["connected", "connecting", "disconnected", "connecting", "disconnected"]);
  });

  it("resolves an area by SDK key or value, and leaves unknown values to the SDK default", () => {
    const table = { BJ: 1, SG: 2, NA: 3, SA: 5, OM: 6 } as const;
    expect(resolveAreaCode("SG", table)).toBe(2);
    expect(resolveAreaCode(" na ", table)).toBe(3);
    expect(resolveAreaCode("6", table)).toBe(6);
    expect(resolveAreaCode("4", table)).toBeUndefined();
    expect(resolveAreaCode("Mars", table)).toBeUndefined();
    expect(resolveAreaCode(undefined, table)).toBeUndefined();
    expect(resolveAreaCode("", table)).toBeUndefined();
  });
});
