// One behavioural contract for RealtimeServer. It runs against the mock transport always, and against the
// Nexconn adapter when REALTIME_CONTRACT=nexconn and the Nexconn credentials are present (skipped otherwise):
//
//   REALTIME_CONTRACT=nexconn NEXCONN_APP_KEY=... NEXCONN_APP_SECRET=... \
//   NEXCONN_PRIMARY_API_DOMAIN=... NEXCONN_SECONDARY_API_DOMAIN=... NEXT_PUBLIC_NEXCONN_APP_KEY=... \
//   pnpm exec vitest run src/tests/integration/realtime-contract.test.ts
//
// The Nexconn run needs a runtime where the Nexconn Web SDK works (it is only used to listen).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mockBus, MockRealtimeServer } from "@/lib/realtime/mock.server";
import type { ClientEvents, PublicState, ReceiptPayload, RealtimeServer, RoomMessage } from "@/lib/realtime/types";

type EventName = Exclude<keyof ClientEvents, "connection" | "patch">;
type Seen = { event: EventName; data: unknown };

interface Listener {
  readonly seen: Seen[];
  /** Resolves with the first matching event, or rejects after the harness's delivery timeout. */
  waitFor(event: EventName, match?: (data: never) => boolean): Promise<Seen>;
  /** Asserts nothing matching arrives within the harness's quiet period. */
  expectNone(event: EventName, match?: (data: never) => boolean): Promise<void>;
  closed(): boolean;
  detach(): Promise<void>;
}

interface Harness {
  server: RealtimeServer;
  /** Join `userId` to `channelId` and record everything delivered to them. */
  attach(channelId: string, userId: string): Promise<Listener>;
  teardown(): Promise<void>;
  /** What the provider can promise; the mock is exact, a real provider is eventually consistent. */
  caps: { exactParticipants: boolean; reportsUndeliveredReceipt: boolean; closesListenersOnDestroy: boolean; waitMs: number; quietMs: number };
}

const EVENTS: EventName[] = ["state", "tally", "idea", "cheer", "moderation", "receipt", "notice"];

function makeListener(opts: { waitMs: number; quietMs: number; detach: () => Promise<void>; closed: () => boolean }): { listener: Listener; push: (e: EventName, d: unknown) => void } {
  const seen: Seen[] = [];
  const find = (event: EventName, match?: (d: never) => boolean) => seen.find((s) => s.event === event && (!match || match(s.data as never)));
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  return {
    push: (event, data) => void seen.push({ event, data }),
    listener: {
      seen,
      async waitFor(event, match) {
        const deadline = Date.now() + opts.waitMs;
        for (;;) {
          const hit = find(event, match);
          if (hit) return hit;
          if (Date.now() > deadline) throw new Error(`no "${event}" within ${opts.waitMs} ms; saw ${JSON.stringify(seen.map((s) => s.event))}`);
          await sleep(5);
        }
      },
      async expectNone(event, match) {
        await sleep(opts.quietMs);
        expect(find(event, match), `unexpected "${event}"`).toBeUndefined();
      },
      closed: opts.closed,
      detach: opts.detach,
    },
  };
}

// ---------- Mock harness ----------

function mockHarness(): Harness {
  mockBus.reset();
  return {
    server: new MockRealtimeServer(),
    caps: { exactParticipants: true, reportsUndeliveredReceipt: true, closesListenersOnDestroy: true, waitMs: 500, quietMs: 20 },
    async attach(channelId, userId) {
      let closed = false;
      let off = () => {};
      const { listener, push } = makeListener({
        waitMs: 500,
        quietMs: 20,
        closed: () => closed,
        detach: async () => off(),
      });
      off = mockBus.subscribe(channelId, {
        userId,
        push: (event, data) => push(event as EventName, data),
        close: () => {
          closed = true;
        },
      });
      return listener;
    },
    async teardown() {
      mockBus.reset();
    },
  };
}

// ---------- Nexconn harness (creds required) ----------

const nexconnCreds = ["NEXCONN_APP_KEY", "NEXCONN_APP_SECRET", "NEXCONN_PRIMARY_API_DOMAIN", "NEXCONN_SECONDARY_API_DOMAIN"].every((k) => process.env[k]);
const nexconnEnabled = process.env.REALTIME_CONTRACT === "nexconn" && nexconnCreds;

async function nexconnHarness(): Promise<Harness> {
  const { createNexconnServer } = await import("@/lib/realtime/nexconn.server");
  const { createNexconnClient } = await import("@/lib/realtime/nexconn.client");
  const server = createNexconnServer();
  const clients: { disconnect(): Promise<void> }[] = [];
  const waitMs = 10_000;
  const quietMs = 1500;
  return {
    server,
    caps: { exactParticipants: false, reportsUndeliveredReceipt: false, closesListenersOnDestroy: false, waitMs, quietMs },
    async attach(channelId, userId) {
      const { token } = await server.ensureUser({ id: userId, name: userId });
      const client = createNexconnClient();
      clients.push(client);
      let closed = false;
      const { listener, push } = makeListener({
        waitMs,
        quietMs,
        closed: () => closed,
        detach: async () => {
          closed = true;
          await client.leaveRoom(channelId);
          await client.disconnect();
        },
      });
      for (const ev of EVENTS) client.on(ev, (d) => push(ev, d));
      await client.connect({ mode: "nexconn", userId, appKey: process.env.NEXT_PUBLIC_NEXCONN_APP_KEY ?? process.env.NEXCONN_APP_KEY, token, area: process.env.NEXT_PUBLIC_NEXCONN_AREA });
      await client.joinRoom(channelId);
      return listener;
    },
    async teardown() {
      await Promise.allSettled(clients.map((c) => c.disconnect()));
    },
  };
}

// ---------- The contract ----------

let seq = 0;
const newChannel = () => `cp_${Array.from({ length: 5 }, (_, k) => String.fromCharCode(65 + (Math.floor(++seq / 26 ** k) % 26))).join("")}`;
const newUser = (tag: string) => `u_contract_${tag}_${Date.now().toString(36)}_${++seq}`;

const stateAt = (v: number, phase: PublicState["phase"] = "STORM"): PublicState => ({
  v, roomCode: "ABCDE", showId: "show_1", phase, roundNo: 1, roundsTotal: 3, phaseStartedAt: 1_700_000_000_000, phaseEndsAt: 1_700_000_030_000,
  serverNow: 1_700_000_001_000, paused: false, title: "Contract show", premise: "A heist", preset: "heist", isDemo: false,
  stats: { players: 2, ideasThisRound: 0, ideasTotal: 0, canonMakers: 0 }, storySoFar: [],
});

const receipt: ReceiptPayload = { t: "receipt", type: "BALLOT", showId: "show_1", roundNo: 1, optionId: "opt_1", optionLabel: "Dig a tunnel", ideaText: "Dig a tunnel under the bank" };

const targets: { name: string; enabled: boolean; make: () => Promise<Harness> }[] = [
  { name: "mock", enabled: true, make: async () => mockHarness() },
  { name: "nexconn", enabled: nexconnEnabled, make: nexconnHarness },
];

for (const target of targets) {
  describe.skipIf(!target.enabled)(`RealtimeServer contract: ${target.name}`, () => {
    // The Nexconn Web SDK only runs in a browser, so its listener half cannot run under Node: those deliveries are
    // checked with real browsers by the live show (`pnpm live:check`, src/tests/live/live-show.spec.ts).
    const itListen = target.name === "nexconn" && typeof window === "undefined" ? it.skip : it;
    let h: Harness;
    beforeAll(async () => {
      h = await target.make();
    });
    afterAll(async () => {
      await h.teardown();
    });

    it("kind matches the adapter", () => {
      expect(h.server.kind).toBe(target.name);
    });

    it("ensureUser returns a non-empty token and may be called again for the same user", async () => {
      const u = newUser("tok");
      const a = await h.server.ensureUser({ id: u, name: "Token Tester" });
      const b = await h.server.ensureUser({ id: u, name: "Token Tester Renamed" });
      expect(typeof a.token).toBe("string");
      expect(a.token.length).toBeGreaterThan(8);
      expect(typeof b.token).toBe("string");
      expect(b.token.length).toBeGreaterThan(8);
    });

    it("ensureChannel and configurePriorities are idempotent", async () => {
      const ch = newChannel();
      await h.server.ensureChannel(ch, "Contract room");
      await h.server.ensureChannel(ch, "Contract room");
      await h.server.configurePriorities();
      await h.server.configurePriorities();
    });

    itListen("publishState reaches every subscriber of the channel and nobody else", async () => {
      const ch = newChannel();
      const other = newChannel();
      await h.server.ensureChannel(ch, "A");
      await h.server.ensureChannel(other, "B");
      const [a, b, outsider] = [await h.attach(ch, newUser("a")), await h.attach(ch, newUser("b")), await h.attach(other, newUser("o"))];
      await h.server.publishState(ch, stateAt(41), { phaseChanged: true });
      for (const l of [a, b]) {
        const got = await l.waitFor("state", (s: PublicState) => s.v === 41);
        expect(got.data).toMatchObject({ v: 41, phase: "STORM", roundNo: 1, title: "Contract show" });
      }
      await outsider.expectNone("state");
      await Promise.all([a, b, outsider].map((l) => l.detach()));
    });

    itListen("publishTally delivers {t:'tally', v, roundNo, tally, total}", async () => {
      const ch = newChannel();
      await h.server.ensureChannel(ch, "Tally");
      const l = await h.attach(ch, newUser("t"));
      await h.server.publishTally(ch, 12, 2, { opt_a: 3, opt_b: 1 }, 4);
      const got = await l.waitFor("tally", (t: { v: number }) => t.v === 12);
      expect(got.data).toEqual({ t: "tally", v: 12, roundNo: 2, tally: { opt_a: 3, opt_b: 1 }, total: 4 });
      await l.detach();
    });

    itListen("sendRoomMessage delivers ideas with the sender's id, in the order they were sent", async () => {
      const ch = newChannel();
      await h.server.ensureChannel(ch, "Ideas");
      const l = await h.attach(ch, newUser("i"));
      const mk = (k: number): RoomMessage => ({ t: "idea", roundNo: 1, text: `Bot idea ${k}`, clientMsgId: `contract-idea-${k}`, name: "Botty", isBot: true });
      for (let k = 1; k <= 3; k++) await h.server.sendRoomMessage(ch, "b_contract_bot", mk(k));
      await l.waitFor("idea", (i: { clientMsgId: string }) => i.clientMsgId === "contract-idea-3");
      const ideas = l.seen.filter((s) => s.event === "idea").map((s) => s.data);
      expect(ideas).toEqual([1, 2, 3].map((k) => ({ ...mk(k), userId: "b_contract_bot" })));
      await l.detach();
    });

    itListen("sendRoomMessage delivers cheers, notices and moderation messages as their own events", async () => {
      const ch = newChannel();
      await h.server.ensureChannel(ch, "Misc");
      const l = await h.attach(ch, newUser("m"));
      await h.server.sendRoomMessage(ch, "u_contract_cheerer", { t: "cheer", emoji: "🎉", name: "Cheerer" });
      await h.server.sendRoomMessage(ch, "cp_narrator", { t: "notice", text: "Storm ends in 5 seconds" });
      await h.server.sendRoomMessage(ch, "cp_narrator", { t: "mod", hide: [{ userId: "u_x", clientMsgId: "contract-hide-1" }], hideUserIds: ["u_banned"], notice: "Removed" });

      const cheer = await l.waitFor("cheer");
      expect(cheer.data).toMatchObject({ t: "cheer", emoji: "🎉", name: "Cheerer", userId: "u_contract_cheerer" });
      const notice = await l.waitFor("notice");
      expect(notice.data).toEqual({ t: "notice", text: "Storm ends in 5 seconds" });
      const mod = await l.waitFor("moderation");
      expect(mod.data).toEqual({ t: "mod", hide: [{ userId: "u_x", clientMsgId: "contract-hide-1" }], hideUserIds: ["u_banned"], notice: "Removed" });
      await l.detach();
    });

    itListen("sendReceipt reaches the addressed user and only them, and reports delivery", async () => {
      const ch = newChannel();
      await h.server.ensureChannel(ch, "Receipts");
      const me = newUser("me");
      const [mine, theirs] = [await h.attach(ch, me), await h.attach(ch, newUser("them"))];
      const delivered = await h.server.sendReceipt(me, receipt);
      expect(delivered).toBe(true);
      const got = await mine.waitFor("receipt");
      expect(got.data).toEqual(receipt);
      await theirs.expectNone("receipt");
      await Promise.all([mine.detach(), theirs.detach()]);
    });

    it("sendReceipt does not claim delivery for a user who is not connected", async () => {
      if (!h.caps.reportsUndeliveredReceipt) return; // a provider may queue direct messages for offline users
      expect(await h.server.sendReceipt(newUser("offline"), receipt)).toBe(false);
    });

    itListen("countParticipants reports distinct connected users (or null when the provider cannot say)", async () => {
      const ch = newChannel();
      await h.server.ensureChannel(ch, "Count");
      expect(await h.server.countParticipants(ch)).toSatisfy((c: number | null) => c === null || c === 0 || !h.caps.exactParticipants);
      const u1 = newUser("c1");
      const listeners = [await h.attach(ch, u1), await h.attach(ch, newUser("c2"))];
      const count = await h.server.countParticipants(ch);
      if (h.caps.exactParticipants) expect(count).toBe(2);
      else expect(count === null || typeof count === "number").toBe(true);
      await Promise.all(listeners.map((l) => l.detach()));
    });

    it("moderate accepts every action, repeated", async () => {
      const ch = newChannel();
      const u = newUser("mod");
      await h.server.ensureChannel(ch, "Moderation");
      for (const action of ["mute", "mute", "unmute", "ban", "ban", "unban", "unmute"] as const) {
        await expect(h.server.moderate(ch, u, action)).resolves.toBeUndefined();
      }
    });

    it("verifyWebhook rejects a request that is not signed by the provider", async () => {
      const raw = JSON.stringify({ messages: [{ providerMsgId: "forged-1", channelId: "cp_ABCDE", fromUserId: "u_x", objectName: "CP:Idea", payload: {}, sentAt: Date.now() }] });
      const unsigned = new Request("http://localhost/api/nexconn/webhook", { method: "POST", body: raw });
      expect(await h.server.verifyWebhook(unsigned, raw)).toBeNull();
      const garbage = new Request("http://localhost/api/nexconn/webhook", { method: "POST", body: "nope", headers: { "x-cp-signature": "0".repeat(64), "x-cp-timestamp": String(Date.now()) } });
      expect(await h.server.verifyWebhook(garbage, "nope")).toBeNull();
    });

    itListen("destroyChannel stops delivery to that channel", async () => {
      const ch = newChannel();
      await h.server.ensureChannel(ch, "Doomed");
      const l = await h.attach(ch, newUser("d"));
      await h.server.destroyChannel(ch);
      if (h.caps.closesListenersOnDestroy) expect(l.closed()).toBe(true);
      await h.server.publishState(ch, stateAt(99), { phaseChanged: true }).catch(() => {}); // a destroyed provider channel may refuse
      await l.expectNone("state", (s: PublicState) => s.v === 99);
      await l.detach();
    });
  });
}
