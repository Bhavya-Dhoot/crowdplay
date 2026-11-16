/* eslint-disable @typescript-eslint/no-explicit-any -- provider response bodies are probed field by field, never trusted */
// Live smoke test for the Nexconn adapters: `pnpm smoke:nexconn`.
//
// Needs real credentials (NEXCONN_APP_KEY, NEXCONN_APP_SECRET, NEXCONN_PRIMARY_API_DOMAIN,
// NEXCONN_SECONDARY_API_DOMAIN in .env / .env.local). Without them it prints which are missing and exits 2.
// With them it exercises the server adapter against the real service, reads the side effects back with signed
// raw requests (this file imports no @nexconn package; the signing scheme is the documented one), prints a
// result table and appends it to docs/NEXCONN_FINDINGS.md. Exit 0 only when every load-bearing check passed.
//
// It changes app-level state: it registers the CP:* priority / low-priority message types and adds up to the
// profanity quota of words from the app's blocklist. It creates and destroys its own test channel.
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const REQUIRED = ["NEXCONN_APP_KEY", "NEXCONN_APP_SECRET", "NEXCONN_PRIMARY_API_DOMAIN", "NEXCONN_SECONDARY_API_DOMAIN"] as const;

function loadEnv(): void {
  // @next/env is not resolvable from the project root under pnpm; resolve it from where `next` lives.
  const fromRoot = createRequire(path.join(process.cwd(), "package.json"));
  const nextPkg = fromRoot.resolve("next/package.json");
  const { loadEnvConfig } = createRequire(nextPkg)("@next/env") as { loadEnvConfig: (dir: string, dev?: boolean) => unknown };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
}

type Status = "PASS" | "FAIL" | "WARN" | "INFO";
type Row = { id: string; u: string; check: string; status: Status; loadBearing: boolean; detail: string };
type Raw = { http: number; code: number | null; json: Record<string, any> | null };

const rows: Row[] = [];

async function main(): Promise<number> {
  loadEnv();
  const missing = REQUIRED.filter((k) => !process.env[k]?.trim());
  if (missing.length) {
    console.error(`needs creds: missing ${missing.join(", ")}`);
    console.error("Set them in .env or .env.local (see env.example) and run `pnpm smoke:nexconn` again.");
    return 2;
  }
  process.env.LOG_LEVEL ??= "silent";

  const appKey = process.env.NEXCONN_APP_KEY as string;
  const secret = process.env.NEXCONN_APP_SECRET as string;
  const scheme = (d: string) => (/^https?:\/\//i.test(d) ? d : `https://${d}`).replace(/\/+$/, "");
  const domains = [scheme(process.env.NEXCONN_PRIMARY_API_DOMAIN as string), scheme(process.env.NEXCONN_SECONDARY_API_DOMAIN as string)];

  /** Signed POST without the SDK: App-Key, Nonce, Timestamp, Signature = sha1(AppSecret + Nonce + Timestamp). */
  async function raw(route: string, body: unknown): Promise<Raw> {
    let lastErr: unknown;
    for (const domain of domains) {
      try {
        const nonce = String(Math.floor(Math.random() * 1e15));
        const ts = String(Date.now());
        const res = await fetch(domain + route, {
          method: "POST",
          headers: { "Content-Type": "application/json", "App-Key": appKey, Nonce: nonce, Timestamp: ts, Signature: createHash("sha1").update(secret + nonce + ts).digest("hex") },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(5000),
        });
        const json = (await res.json().catch(() => null)) as Record<string, any> | null;
        return { http: res.status, code: typeof json?.code === "number" ? json.code : null, json };
      } catch (err) {
        lastErr = err;
      }
    }
    throw new Error(`no API domain answered: ${String(lastErr)}`);
  }

  // Everything the adapter would only log is collected here so each check can see it.
  const { log } = await import("../src/lib/log");
  const captured: Record<string, any>[] = [];
  for (const level of ["warn", "error"] as const) {
    const original = log[level].bind(log) as (...a: unknown[]) => void;
    (log as unknown as Record<string, unknown>)[level] = (obj: unknown, ...rest: unknown[]) => {
      if (obj && typeof obj === "object") captured.push(obj as Record<string, any>);
      original(obj, ...rest);
    };
  }
  const adapterFailures = (): string[] =>
    captured.splice(0).map((c) => `${String(c.op ?? "adapter")} code ${String(c.code ?? "?")}${c.message ? `: ${String(c.message)}` : c.err ? `: ${String((c.err as Error).message ?? c.err)}` : ""}`);

  const { createNexconnServer, resetNexconnServer } = await import("../src/lib/realtime/nexconn.server");
  const { NARRATOR_USER_ID } = await import("../src/lib/realtime/types");
  const { encodeStateMessage } = await import("../src/lib/realtime/nexconn.codec");
  resetNexconnServer();
  const server = createNexconnServer();

  const stamp = Date.now().toString(36);
  const channelId = `cpsmoke${stamp}`;
  const plainUser = `cpsmokeuser${stamp}`;
  const underscoreUser = `u_smoke_${stamp}`;

  const state = {
    v: 1,
    roomCode: "SMOKE",
    showId: "show_smoke",
    phase: "STORM" as const,
    roundNo: 1,
    roundsTotal: 3,
    phaseStartedAt: Date.now(),
    phaseEndsAt: Date.now() + 30_000,
    serverNow: Date.now(),
    paused: false,
    title: "Smoke show",
    premise: "A smoke test",
    preset: "custom" as const,
    isDemo: false,
    stats: { players: 0, ideasThisRound: 0, ideasTotal: 0, canonMakers: 0 },
    storySoFar: [],
  };
  const receipt = { t: "receipt" as const, type: "BALLOT" as const, showId: "show_smoke", roundNo: 1, optionId: "opt_smoke", optionLabel: "Smoke", ideaText: "Smoke test idea" };

  async function check(id: string, u: string, name: string, loadBearing: boolean, fn: () => Promise<{ status: Status; detail: string }>): Promise<void> {
    try {
      const r = await fn();
      rows.push({ id, u, check: name, status: r.status, loadBearing, detail: r.detail });
    } catch (err) {
      rows.push({ id, u, check: name, status: "FAIL", loadBearing, detail: err instanceof Error ? err.message : String(err) });
    }
  }
  const verdict = (failures: string[], okDetail: string, failStatus: Status = "FAIL") =>
    failures.length === 0 ? { status: "PASS" as const, detail: okDetail } : { status: failStatus, detail: failures.join("; ") };

  // 1. token issue
  await check("token", "U1", "issueAccessToken for a plain user id", true, async () => {
    const { token } = await server.ensureUser({ id: plainUser, name: "Smoke Tester" });
    return token.length > 8 ? { status: "PASS", detail: `token of ${token.length} chars` } : { status: "FAIL", detail: "token too short" };
  });
  await check("token-ids", "U1", "user ids the app really uses: u_<id> and cp_narrator (underscore)", true, async () => {
    const bad: string[] = [];
    for (const id of [underscoreUser, NARRATOR_USER_ID]) {
      try {
        await server.ensureUser({ id, name: id === NARRATOR_USER_ID ? "CrowdPlay Narrator" : "Smoke Underscore" });
      } catch (err) {
        bad.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return bad.length ? { status: "FAIL", detail: `${bad.join("; ")} (ids with '_' are rejected: change newUserId() / NARRATOR_USER_ID)` } : { status: "PASS", detail: "both accepted" };
  });

  // 2. channel
  await check("channel", "U9", "ensureChannel: create + longest keep-alive + priority sender", true, async () => {
    await server.ensureChannel(channelId, "Smoke room");
    await server.ensureChannel(channelId, "Smoke room"); // idempotent
    const f = adapterFailures();
    const info = await raw("/v4/open-channel/get", { channelId });
    const r = info.json?.result ?? {};
    if (f.length) return { status: "FAIL", detail: f.join("; ") };
    if (info.code !== 0) return { status: "FAIL", detail: `getOpenChannel code ${String(info.code)}` };
    const keepAlive = r.destroyType === 0 && r.ttlMinutes === 10_080;
    return { status: keepAlive ? "PASS" : "WARN", detail: `destroyType ${String(r.destroyType)}, ttlMinutes ${String(r.ttlMinutes)}${keepAlive ? "" : " (expected 0 / 10080: free plan may cap the TTL)"}` };
  });

  // 3. state: metadata + CP:State
  await check("state", "U2/U3/U4", "publishState: metadata batch set + CP:State message, metadata read back", true, async () => {
    await server.publishState(channelId, state, { phaseChanged: true });
    const f = adapterFailures();
    const got = await raw("/v4/open-channel/metadata/batch/get", { channelId });
    const entries: { key?: string; value?: string }[] = got.json?.result?.metadata ?? [];
    const keys = entries.map((e) => e.key).sort();
    const want = ["cp_options", "cp_outcome", "cp_phase", "cp_prompt", "cp_stats", "cp_story", "cp_tally"];
    const phase = entries.find((e) => e.key === "cp_phase")?.value;
    const readback = want.every((k) => keys.includes(k)) && phase !== undefined && (JSON.parse(phase) as { phase?: string }).phase === "STORM";
    if (f.length) return { status: "FAIL", detail: f.join("; ") };
    return readback ? { status: "PASS", detail: `${keys.length} keys read back; CP:State accepted` } : { status: "FAIL", detail: `metadata read-back code ${String(got.code)}, keys ${keys.join(",") || "none"}` };
  });
  await check("meta-charset", "U3", "metadata key charset: is a '.' key (cp.phase) accepted?", false, async () => {
    const set = (metadata: Record<string, string>) => raw("/v4/open-channel/metadata/batch/set", { channelId, metadataOwnerId: NARRATOR_USER_ID, metadata, shouldAutoDelete: 0 });
    const dotted = await set({ "cp.dot": "1" });
    const valid = await set({ "cp_ok-1": "1" });
    const big = await set({ cp_big: "x".repeat(4000) });
    return {
      status: "INFO",
      detail: `'cp.dot' -> code ${String(dotted.code)} (${dotted.code === 0 ? "accepted: dots are fine" : "rejected: keep underscores"}); 'cp_ok-1' -> ${String(valid.code)}; 4000-char value -> ${String(big.code)}`,
    };
  });
  await check("text-envelope", "U4", "RC:TxtMsg fallback envelope accepted by the server (NEXCONN_TEXT_ENVELOPE=1)", false, async () => {
    process.env.NEXCONN_TEXT_ENVELOPE = "1";
    try {
      await server.publishState(channelId, { ...state, v: 2 }, { phaseChanged: true });
    } finally {
      delete process.env.NEXCONN_TEXT_ENVELOPE;
    }
    const probe = encodeStateMessage({ ...state, v: 3 }, "custom");
    const unknown = await raw("/v4/open-channel/message/send", { fromUserId: NARRATOR_USER_ID, toChannelIds: [channelId], messageType: "CP:Probe", content: probe?.content ?? "{}", shouldPersist: 0 });
    const f = adapterFailures();
    return { status: f.length ? "FAIL" : "INFO", detail: f.length ? f.join("; ") : `fallback sent; a never-registered custom type -> code ${String(unknown.code)}. Whether Web clients receive it needs the two-browser show.` };
  });
  await check("room-messages", "U4", "publishTally + sendRoomMessage (bot idea, cheer, notice, moderation)", true, async () => {
    await server.publishTally(channelId, 4, 1, { opt_a: 2, opt_b: 1 }, 3);
    await server.sendRoomMessage(channelId, `b_smoke_${stamp}`, { t: "idea", roundNo: 1, text: "Smoke idea", clientMsgId: `smoke-${stamp}`, name: "Smoke bot", isBot: true });
    await server.sendRoomMessage(channelId, plainUser, { t: "cheer", emoji: "🎉" });
    await server.sendRoomMessage(channelId, NARRATOR_USER_ID, { t: "notice", text: "Smoke notice" });
    await server.sendRoomMessage(channelId, NARRATOR_USER_ID, { t: "mod", hideUserIds: [plainUser] });
    return verdict(adapterFailures(), "all accepted by the server (client delivery needs the two-browser show)");
  });

  // 4. priorities
  await check("priorities", "U6", "configurePriorities: CP:State/CP:Moderation priority, CP:Idea/CP:Cheer low priority", false, async () => {
    await server.configurePriorities();
    const f = adapterFailures();
    const prio = await raw("/v4/open-channel/priority-message-type-list/get", {});
    const low = await raw("/v4/open-channel/low-priority-message-type-list/get", {});
    const has = (r: Raw, ...types: string[]) => types.every((t) => (r.json?.result?.messageTypes ?? []).includes(t));
    const ok = has(prio, "CP:State", "CP:Moderation") && has(low, "CP:Idea", "CP:Cheer");
    if (ok) return { status: "PASS", detail: "registered and read back" };
    const hint = prio.code === 1009 || low.code === 1009 ? " (code 1009: enable 'Open channel message priority' in the Console)" : "";
    return { status: "WARN", detail: `priority list code ${String(prio.code)}, low-priority list code ${String(low.code)}${hint}${f.length ? `; ${f.join("; ")}` : ""}` };
  });
  await check("priority-sender", "U6", "narrator is on the channel's priority sender list", false, async () => {
    const r = await raw("/v4/open-channel/priority-sender-list/get", { channelId });
    const ids: string[] = r.json?.result?.participantIds ?? [];
    return ids.includes(NARRATOR_USER_ID) ? { status: "PASS", detail: "cp_narrator listed" } : { status: "WARN", detail: `code ${String(r.code)}, senders [${ids.join(",")}]` };
  });

  // 5. receipts
  await check("receipt", "U7", "sendReceipt: direct message from the narrator, system message as fallback", true, async () => {
    const delivered = await server.sendReceipt(plainUser, receipt);
    const f = adapterFailures();
    const content = JSON.stringify(receipt);
    const direct = await raw("/v4/direct-channel/message/send", { fromUserId: NARRATOR_USER_ID, toUserIds: [plainUser], messageType: "CP:Receipt", content, shouldPersist: 0, disablePush: true });
    const system = await raw("/v4/system-channel/message/send", { fromUserId: NARRATOR_USER_ID, toUserIds: [plainUser], messageType: "CP:Receipt", content, shouldPersist: 0, disablePush: true });
    const detail = `adapter returned ${String(delivered)}; direct code ${String(direct.code)}, system code ${String(system.code)}. Accepted is not shown: confirm in a browser that the toast appears for a user who never opened that channel.`;
    return delivered ? { status: "PASS", detail } : { status: "FAIL", detail: `${detail}${f.length ? ` ${f.join("; ")}` : ""}` };
  });

  // 6. participants + moderation
  await check("participants", "U8", "countParticipants (participant list total)", true, async () => {
    const n = await server.countParticipants(channelId);
    adapterFailures();
    return n === null ? { status: "FAIL", detail: "null: the list call failed" } : { status: "PASS", detail: `total ${n} (an empty channel)` };
  });
  await check("moderation", "U8", "mute / unmute / ban / unban a test user, read back from the lists", true, async () => {
    const problems: string[] = [];
    const listed = async (route: string, key: string) => ((await raw(route, { channelId })).json?.result?.[key] ?? []).some((p: { participantId?: string }) => p.participantId === plainUser);
    const steps: [string, "mute" | "ban" | "unmute" | "unban", string, string, boolean][] = [
      ["mute", "mute", "/v4/open-channel/participant/mute-list/get", "mutedParticipants", true],
      ["unmute", "unmute", "/v4/open-channel/participant/mute-list/get", "mutedParticipants", false],
      ["ban", "ban", "/v4/open-channel/participant/ban-list/get", "bannedParticipants", true],
      ["unban", "unban", "/v4/open-channel/participant/ban-list/get", "bannedParticipants", false],
    ];
    for (const [label, action, route, key, expected] of steps) {
      await server.moderate(channelId, plainUser, action);
      const f = adapterFailures();
      if (f.length) problems.push(`${label}: ${f.join("; ")}`);
      else if ((await listed(route, key)) !== expected) problems.push(`${label}: list does not show ${expected ? "the user" : "the user removed"}`);
    }
    return verdict(problems, "all four actions accepted and visible in the lists");
  });

  // 7. profanity
  await check("profanity", "U10", "profanity list: blocklist synced by configurePriorities, provider quota", false, async () => {
    const list = await raw("/v4/profanity-word/list", { filterType: "2" });
    const words: unknown[] = list.json?.result?.words ?? [];
    const probeWord = `cpsmoke${stamp}`.slice(0, 32);
    const add = await raw("/v4/profanity-word/batch/add", { words: [{ word: probeWord }] });
    if (add.code === 0) await raw("/v4/profanity-word/remove", { word: probeWord });
    return {
      status: "INFO",
      detail: `${words.length} words on the provider list (list code ${String(list.code)}); adding one more -> code ${String(add.code)}${add.code === 0 ? " (removed again)" : " (quota full or not permitted: the app-level filter stays authoritative)"}`,
    };
  });

  // 8. webhook + browser-only notes
  await check("webhook", "U5", "webhook URL reachability from this machine (the Console setting itself cannot be read)", false, async () => {
    const appUrl = process.env.APP_URL?.trim() || "http://localhost:3000";
    const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(appUrl);
    const url = `${appUrl.replace(/\/+$/, "")}/api/nexconn/webhook`;
    let probe: string;
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: AbortSignal.timeout(4000) });
      probe = `unsigned POST -> HTTP ${res.status}${res.status === 401 ? " (rejected as it should be)" : ""}`;
    } catch {
      probe = "not reachable from here (is the app running?)";
    }
    return { status: "INFO", detail: `${url}: ${probe}. ${isLocal ? "APP_URL is local: Nexconn cannot call it; use the deployed https URL in Console > Chat > Chat settings > Webhooks and subscribe to message:send." : "Confirm the same URL and the message:send event in Console > Chat > Chat settings > Webhooks."}` };
  });
  await check("client-sdk", "U1/U2", "Web SDK facts (package versions; metadata subscribe and join need a browser)", false, async () => {
    const version = (name: string) => {
      try {
        return (JSON.parse(fs.readFileSync(path.join(process.cwd(), "node_modules", name, "package.json"), "utf8")) as { version: string }).version;
      } catch {
        return "not installed";
      }
    };
    return { status: "INFO", detail: `@nexconn/chat ${version("@nexconn/chat")}, @nexconn/engine ${version("@nexconn/engine")}. Client behaviour is confirmed only by the two-browser live show.` };
  });

  // 9. cleanup
  await check("destroy", "U9", "destroyChannel removes the test channel", true, async () => {
    await server.destroyChannel(channelId);
    const f = adapterFailures();
    const gone = await raw("/v4/open-channel/get", { channelId });
    if (f.length) return { status: "FAIL", detail: f.join("; ") };
    return gone.code === 23410 ? { status: "PASS", detail: "getOpenChannel now answers 23410 (does not exist)" } : { status: "WARN", detail: `getOpenChannel code ${String(gone.code)} after destroy (may lag)` };
  });

  // ---- report ----
  const width = Math.max(...rows.map((r) => r.check.length));
  console.log("");
  for (const r of rows) console.log(`${r.status.padEnd(5)} ${r.u.padEnd(9)} ${r.check.padEnd(width)}  ${r.loadBearing ? "[load-bearing] " : ""}${r.detail}`);
  const failed = rows.filter((r) => r.status === "FAIL" && r.loadBearing);
  const warned = rows.filter((r) => r.status === "FAIL" && !r.loadBearing);
  console.log(`\n${rows.filter((r) => r.status === "PASS").length} passed, ${failed.length} load-bearing failed, ${warned.length} other failed, ${rows.filter((r) => r.status === "WARN").length} warnings`);

  const when = new Date().toISOString();
  const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\s+/g, " ");
  const section = [
    "",
    `## Live smoke results (${when})`,
    "",
    `Run by \`pnpm smoke:nexconn\` against ${domains[0].replace(/^https?:\/\//, "")} (primary) / ${domains[1].replace(/^https?:\/\//, "")} (backup). Test channel \`${channelId}\` was created and destroyed.`,
    "",
    "| Check | U | Result | Load-bearing | Detail |",
    "|---|---|---|---|---|",
    ...rows.map((r) => `| ${esc(r.check)} | ${r.u} | ${r.status} | ${r.loadBearing ? "yes" : "no"} | ${esc(r.detail)} |`),
    "",
    failed.length === 0 ? "All load-bearing checks passed." : `Load-bearing failures: ${failed.map((r) => r.id).join(", ")}.`,
    "",
  ].join("\n");
  const findings = path.join(process.cwd(), "docs", "NEXCONN_FINDINGS.md");
  fs.appendFileSync(findings, section);
  console.log(`Appended the results to ${path.relative(process.cwd(), findings)}`);
  return failed.length === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error("smoke test crashed:", err);
    process.exit(1);
  },
);
