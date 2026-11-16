// Shared e2e plumbing: the console guard (GOAL E5), context factory, HTTP API driver and page helpers.
//
// (Fixture callbacks name Playwright's `use` parameter `provide`: `use` trips the react-hooks lint rule.)
// Console guard: every page of every context made through `newContext` (and the default `context`/`page`)
// reports console errors, console warnings and uncaught page errors. The test fails if any appear. There is
// no global allowlist. A test that deliberately provokes an HTTP error (a muted player posting an idea, say)
// declares it with `guard.expectHttpError(status, path, why)`: that one status on that one path is tolerated
// in that test only, and the declaration itself fails the test if the error never happened.
import {
  expect,
  test as base,
  type APIRequestContext,
  type BrowserContext,
  type BrowserContextOptions,
  type ConsoleMessage,
  type Locator,
  type Page,
} from "@playwright/test";
import type { CreateRoomInput, HostActionInput } from "@/lib/api/contracts";
import type { Phase, PublicState } from "@/lib/realtime/types";

declare global {
  interface Window {
    __cpPhases?: { phase: string; round: number; at: number }[];
    __cpClickAt?: number;
    __cpCanvasAdded?: number;
  }
}

// ---------- the guard ----------

type Allowance = { status: number; path: RegExp; why: string; hits: number };

export type Guard = {
  /** Tolerate `status` responses for URLs whose path matches `path`, in this test only. Must actually occur. */
  expectHttpError(status: number, path: RegExp, why: string): void;
};

class GuardState implements Guard {
  readonly issues: string[] = [];
  readonly allowances: Allowance[] = [];
  /** Set once the test body is over: contexts are being closed and late noise from that is not the app's. */
  sealed = false;

  expectHttpError(status: number, path: RegExp, why: string): void {
    this.allowances.push({ status, path, why, hits: 0 });
  }

  note(problem: string): void {
    if (!this.sealed) this.issues.push(problem);
  }

  /** Browser-reported HTTP failures arrive as console errors; declared ones are counted, not reported. */
  http(status: number, path: string): boolean {
    const hit = this.allowances.find((a) => a.status === status && a.path.test(path));
    if (hit) hit.hits += 1;
    return Boolean(hit);
  }

  problems(): string[] {
    const unused = this.allowances.filter((a) => a.hits === 0).map((a) => `expected HTTP ${a.status} on ${a.path} (${a.why}) never happened`);
    return [...this.issues, ...unused];
  }
}

const HTTP_FAIL = /^Failed to load resource: the server responded with a status of (\d{3})/;

/** Runs in every page before our code: records phase changes, the last click time and canvas insertions. */
function recorder(): void {
  const phases: NonNullable<Window["__cpPhases"]> = [];
  window.__cpPhases = phases;
  window.__cpCanvasAdded = 0;
  let last = "";
  const read = () => {
    const el = document.querySelector('[data-testid="phase"]');
    const phase = el?.getAttribute("data-phase") ?? "";
    const round = Number(el?.getAttribute("data-round") ?? 0);
    const key = `${phase}:${round}`;
    if (phase && key !== last) {
      last = key;
      phases.push({ phase, round, at: Date.now() });
    }
  };
  new MutationObserver((records) => {
    read();
    for (const r of records) {
      r.addedNodes.forEach((n) => {
        if (n instanceof HTMLCanvasElement || (n instanceof Element && n.querySelector("canvas"))) window.__cpCanvasAdded = (window.__cpCanvasAdded ?? 0) + 1;
      });
    }
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-phase", "data-round"] });
  document.addEventListener("click", () => (window.__cpClickAt = Date.now()), { capture: true });
}

type Fixtures = {
  guard: Guard;
  /** A new browser context whose pages are watched by the guard. Closed after the test. */
  newContext: (options?: BrowserContextOptions) => Promise<BrowserContext>;
  /** A new HTTP session (own cookie jar) with a display name. */
  newApi: (displayName: string) => Promise<Api>;
};

export const test = base.extend<Fixtures & { guardState: GuardState }>({
  guardState: async ({}, provide, testInfo) => {
    const state = new GuardState();
    await provide(state);
    const problems = state.problems();
    if (problems.length > 0) await testInfo.attach("console-problems", { body: problems.join("\n"), contentType: "text/plain" });
    // When the test already failed the problems are only attached, so the first real failure stays the headline.
    if (testInfo.status === "passed" || testInfo.status === undefined) {
      expect(problems, "console errors, warnings and page errors (GOAL E5)").toEqual([]);
    }
  },

  guard: async ({ guardState }, provide) => {
    await provide(guardState);
  },

  newContext: async ({ browser, guardState }, provide) => {
    const contexts: BrowserContext[] = [];

    const watch = (page: Page): void => {
      const where = () => new URL(page.url(), "http://x").pathname || "(blank)";
      page.on("console", (msg: ConsoleMessage) => {
        const type = msg.type();
        if (type !== "error" && type !== "warning") return;
        const text = msg.text();
        const http = HTTP_FAIL.exec(text);
        if (http) {
          let path = "";
          try {
            path = new URL(msg.location().url).pathname;
          } catch {
            path = "";
          }
          if (guardState.http(Number(http[1]), path)) return;
        }
        guardState.note(`[${type}] ${text} (page ${where()}, source ${msg.location().url}:${msg.location().lineNumber})`);
      });
      page.on("pageerror", (err) => guardState.note(`[pageerror] ${err.message} (page ${where()})`));
      page.on("crash", () => guardState.note(`[crash] page crashed (page ${where()})`));
    };

    await provide(async (options = {}) => {
      const context = await browser.newContext(options);
      await context.addInitScript(recorder);
      context.on("page", watch);
      contexts.push(context);
      return context;
    });

    guardState.sealed = true;
    await Promise.all(contexts.map((c) => c.close().catch(() => undefined)));
  },

  context: async ({ newContext }, provide) => {
    await provide(await newContext());
  },

  page: async ({ context }, provide) => {
    await provide(await context.newPage());
  },

  newApi: async ({ playwright, baseURL }, provide) => {
    const made: APIRequestContext[] = [];
    await provide(async (displayName) => {
      const req = await playwright.request.newContext({ baseURL });
      made.push(req);
      const api = new Api(req);
      await api.login(displayName);
      return api;
    });
    await Promise.all(made.map((r) => r.dispose()));
  },
});
export { expect };

// ---------- HTTP API driver ----------

export type Call<T> = { status: number; body: T };
type Json = Record<string, unknown>;

export class Api {
  userId = "";
  displayName = "";
  constructor(readonly req: APIRequestContext) {}

  async login(displayName: string): Promise<void> {
    const r = await this.post<{ ok: boolean; user: { id: string; displayName: string } }>("/api/session", { displayName });
    expect(r.status, "POST /api/session").toBe(200);
    this.userId = r.body.user.id;
    this.displayName = r.body.user.displayName;
  }

  async get<T = Json>(path: string, headers?: Record<string, string>): Promise<Call<T>> {
    const res = await this.req.get(path, { headers });
    return { status: res.status(), body: (await res.json().catch(() => ({}))) as T };
  }

  async post<T = Json>(path: string, data?: unknown, headers?: Record<string, string>): Promise<Call<T>> {
    const res = await this.req.post(path, { data, headers });
    return { status: res.status(), body: (await res.json().catch(() => ({}))) as T };
  }

  /** Create a show. Defaults suit a fast, auto-advancing show; override per test. */
  async createShow(over: Partial<CreateRoomInput> = {}): Promise<Show> {
    const input: CreateRoomInput = {
      title: "E2E Heist Night",
      preset: "heist",
      premise: "A crew of amateurs breaks into the city's most boring vault.",
      roundsTotal: 3,
      stormMs: 24_000,
      voteMs: 20_000,
      autoAdvance: true,
      strictFilter: true,
      ...over,
    };
    const r = await this.post<{ ok: boolean; code: string; showId: string; hostKey: string; links: Record<string, string> }>("/api/rooms", input);
    expect(r.status, `POST /api/rooms ${JSON.stringify(r.body)}`).toBe(200);
    return { code: r.body.code, showId: r.body.showId, hostKey: r.body.hostKey, links: r.body.links, api: this };
  }

  async state(code: string): Promise<PublicState> {
    const r = await this.get<{ ok: boolean; state: PublicState }>(`/api/rooms/${code}/state`);
    expect(r.status, `GET state ${code}`).toBe(200);
    return r.body.state;
  }

  async join(code: string): Promise<void> {
    const r = await this.post(`/api/rooms/${code}/join`, {});
    expect(r.status, `join ${code}`).toBe(200);
  }

  async idea(code: string, roundNo: number, text: string): Promise<Call<{ ok: boolean; code?: string }>> {
    return this.post(`/api/rooms/${code}/ideas`, { roundNo, text, clientMsgId: `e2e${Math.random().toString(16).slice(2)}${Date.now().toString(16)}` });
  }
}

export type Show = { code: string; showId: string; hostKey: string; links: Record<string, string>; api: Api };

/** Host action over HTTP (the host console is exercised separately in the host spec). */
export async function hostAction(show: Show, action: HostActionInput): Promise<PublicState> {
  const r = await show.api.post<{ ok: boolean; state: PublicState }>(`/api/rooms/${show.code}/host`, action, { "x-host-key": show.hostKey });
  expect(r.status, `host ${action.action}: ${JSON.stringify(r.body)}`).toBe(200);
  return r.body.state;
}

export async function hostFeed(show: Show): Promise<{
  ideas: { id: string; userId: string; name: string; text: string; status: string; isBot: boolean }[];
  players: { userId: string; name: string; muted: boolean; banned: boolean; isBot: boolean; ideas: number }[];
  metrics: { distillMs: number | null; fallbackUsed: boolean; rerollUsed: boolean; autoAdvance: boolean };
  state: PublicState;
}> {
  const r = await show.api.get<never>(`/api/rooms/${show.code}/host/feed`, { "x-host-key": show.hostKey });
  expect(r.status, "host feed").toBe(200);
  return r.body;
}

// ---------- page helpers ----------

export const PHASES: Phase[] = ["LOBBY", "PROMPT", "STORM", "DISTILL", "VOTE", "REVEAL", "FINALE", "ENDED"];

export const phaseRoot = (page: Page): Locator => page.getByTestId("phase");

export async function expectPhase(page: Page, phase: Phase, timeout = 15_000): Promise<void> {
  await expect(phaseRoot(page)).toHaveAttribute("data-phase", phase, { timeout });
}

/** Phase changes this page has rendered so far (recorded by the init script, so short phases are not missed). */
export async function phaseLog(page: Page): Promise<{ phase: string; round: number; at: number }[]> {
  return page.evaluate(() => window.__cpPhases ?? []);
}

/** True if `want` occurs in `have` in order (not necessarily adjacent). */
export function inOrder(have: readonly string[], want: readonly string[]): boolean {
  let i = 0;
  for (const h of have) if (h === want[i]) i += 1;
  return i >= want.length;
}

/** Resolves with Date.now() (page clock) when `text` first appears in the DOM under `selector`. Start it BEFORE the send. */
export function whenTextAppears(page: Page, text: string, selector = "body", timeoutMs = 8000): Promise<number> {
  return page.evaluate(
    ({ text, selector, timeoutMs }) =>
      new Promise<number>((resolve, reject) => {
        const has = () => Array.from(document.querySelectorAll(selector)).some((el) => (el.textContent ?? "").includes(text));
        if (has()) return resolve(Date.now());
        const stop = setTimeout(() => {
          mo.disconnect();
          reject(new Error(`"${text}" never appeared under ${selector}`));
        }, timeoutMs);
        const mo = new MutationObserver(() => {
          if (has()) {
            clearTimeout(stop);
            mo.disconnect();
            resolve(Date.now());
          }
        });
        mo.observe(document, { subtree: true, childList: true, characterData: true });
      }),
    { text, selector, timeoutMs },
  );
}

/** Join through the UI the way a guest does from a QR code: /join/CODE, name, "I'm in". Lands on /play/CODE. */
export async function joinAs(page: Page, code: string, name: string): Promise<void> {
  await page.goto(`/join/${code}`);
  await page.getByTestId("name-input").fill(name);
  await page.getByTestId("join-submit").click();
  await page.waitForURL(`**/play/${code}`);
  await expect(phaseRoot(page)).toBeVisible();
}

/** Type and send an idea; resolves with the page-clock time of the click on Send. */
export async function sendIdea(page: Page, text: string): Promise<number> {
  const input = page.getByTestId("idea-input");
  await expect(input).toBeEnabled();
  await input.fill(text);
  const send = page.getByTestId("idea-send");
  await expect(send).toBeEnabled();
  await send.click();
  const at = await page.evaluate(() => window.__cpClickAt ?? 0);
  expect(at, "send click was recorded").toBeGreaterThan(0);
  return at;
}

/** Percent in the aria-label of a player option card ("... 40 percent of votes ..."). */
export async function optionPercent(page: Page, slot: "A" | "B" | "C"): Promise<number> {
  const label = (await page.getByTestId(`option-${slot}`).getAttribute("aria-label")) ?? "";
  const m = /(\d+) percent of votes/.exec(label);
  expect(m, `percent in "${label}"`).not.toBeNull();
  return Number(m?.[1]);
}

/** The label text of a player option card (second sentence of its aria-label). */
export async function optionLabel(page: Page, slot: "A" | "B" | "C"): Promise<string> {
  const label = (await page.getByTestId(`option-${slot}`).getAttribute("aria-label")) ?? "";
  return label.split(". ")[1] ?? "";
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** No horizontal page scroll: the document is not wider than the viewport. */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.documentElement;
    return Math.max(el.scrollWidth, document.body?.scrollWidth ?? 0) - el.clientWidth;
  });
}

/** Resolves with Date.now() (page clock) when a vote card's label stops being `oldLabel`. Start it BEFORE the trigger. */
export function whenOptionLabelChanges(page: Page, slot: "A" | "B" | "C", oldLabel: string, timeoutMs = 8000): Promise<number> {
  return page.evaluate(
    ({ slot, oldLabel, timeoutMs }) =>
      new Promise<number>((resolve, reject) => {
        const labelNow = () => (document.querySelector(`[data-testid="option-${slot}"]`)?.getAttribute("aria-label") ?? "").split(". ")[1] ?? "";
        const differs = () => {
          const now = labelNow();
          return now !== "" && now !== oldLabel;
        };
        if (differs()) return resolve(Date.now());
        const stop = setTimeout(() => {
          mo.disconnect();
          reject(new Error(`option ${slot} still says "${oldLabel}"`));
        }, timeoutMs);
        const mo = new MutationObserver(() => {
          if (differs()) {
            clearTimeout(stop);
            mo.disconnect();
            resolve(Date.now());
          }
        });
        mo.observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["aria-label"] });
      }),
    { slot, oldLabel, timeoutMs },
  );
}

/** The click time recorded in the page (see the init script). */
export function lastClickAt(page: Page): Promise<number> {
  return page.evaluate(() => window.__cpClickAt ?? 0);
}

export type LayoutAudit = { overflowPx: number; wide: string[]; outside: string[]; tooSmall: string[] };

/**
 * GOAL E2 for whatever is on screen right now.
 *  overflowPx  how far the document is wider than the viewport (0 = no horizontal scroll)
 *  wide        when the page scrolls sideways: the elements that reach furthest past the right edge (to find the culprit)
 *  outside     visible controls that stick out of the viewport sideways (not counting ones inside a sideways scroller)
 *  tooSmall    controls whose tappable area is under 44 x 44 px. The area is probed by hit-testing a 44 x 44 box
 *              around the control, so padding and ::before hit-area extensions count, overlapped controls do not.
 *              Links inside running text are exempt (WCAG 2.5.8 "inline"), as are the skip link and sr-only text.
 */
export function layoutAudit(page: Page): Promise<LayoutAudit> {
  return page.evaluate(() => {
    const MIN = 44;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const describe = (el: Element): string => {
      const id = el.getAttribute("data-testid");
      const text = (el.getAttribute("aria-label") ?? el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 36);
      return `${el.tagName.toLowerCase()}${id ? `[${id}]` : ""}${text ? ` "${text}"` : ""}`;
    };
    const visible = (el: Element, r: DOMRect): boolean => {
      const s = getComputedStyle(el);
      return s.visibility !== "hidden" && s.display !== "none" && r.width > 1 && r.height > 1 && Number(s.opacity) > 0.01;
    };
    const inSidewaysScroller = (el: Element): boolean => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if ((o === "auto" || o === "scroll") && p.scrollWidth > p.clientWidth) return true;
      }
      return false;
    };
    const controls = Array.from(
      document.querySelectorAll('a[href], button, input:not([type="hidden"]), textarea, select, [role="button"], [role="switch"], [role="checkbox"], [role="tab"]'),
    );
    const outside: string[] = [];
    const tooSmall: string[] = [];
    for (const el of controls) {
      const r = el.getBoundingClientRect();
      if (!visible(el, r) || el.closest(".skip-link, .sr-only") || el.classList.contains("skip-link")) continue;
      if (r.bottom < 0 || r.top > vh) continue; // scrolled out of view: nothing to hit-test
      if ((r.left < -0.5 || r.right > vw + 0.5) && !inSidewaysScroller(el)) outside.push(describe(el));
      if (el instanceof HTMLAnchorElement && getComputedStyle(el).display === "inline" && el.closest("p, li")) continue;
      if (r.width >= MIN - 0.5 && r.height >= MIN - 0.5) continue;
      // Hit-test a MIN x MIN box centred on the control (3 x 3 probes, 1 px inside the corners).
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      let ok = true;
      for (const dx of [-1, 0, 1]) {
        for (const dy of [-1, 0, 1]) {
          const x = cx + dx * (MIN / 2 - 1);
          const y = cy + dy * (MIN / 2 - 1);
          if (x < 0 || y < 0 || x >= vw || y >= vh) continue; // box leaves the screen: judge the part that is on it
          const hit = document.elementFromPoint(x, y);
          if (!hit || !(el === hit || el.contains(hit))) ok = false;
        }
      }
      if (!ok) tooSmall.push(`${describe(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    const root = document.documentElement;
    const overflowPx = Math.max(root.scrollWidth, document.body?.scrollWidth ?? 0) - root.clientWidth;
    const wide: string[] = [];
    if (overflowPx > 0) {
      const reach = Array.from(document.body.querySelectorAll("*"))
        .map((el) => ({ el, right: el.getBoundingClientRect().right }))
        .filter((x) => x.right > vw + 0.5)
        .sort((a, b) => b.right - a.right)
        .slice(0, 4);
      for (const x of reach) wide.push(`${describe(x.el)} <${x.el.className.toString().slice(0, 50)}> right edge ${Math.round(x.right)}px`);
      // Text that spills out of its own box (a long word with no wrapping) does not move the box: look at scroll sizes too.
      const spill = Array.from(document.body.querySelectorAll("*"))
        .filter((el) => el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && getComputedStyle(el).overflowX === "visible")
        .sort((a, b) => b.scrollWidth - b.clientWidth - (a.scrollWidth - a.clientWidth))
        .slice(0, 3);
      for (const el of spill) wide.push(`${describe(el)} <${el.className.toString().slice(0, 50)}> content ${el.scrollWidth}px in a ${el.clientWidth}px box`);
    }
    return { overflowPx, wide, outside, tooSmall };
  });
}

/** Text of every aria-live region on the page. */
export function liveRegions(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[aria-live="polite"], [aria-live="assertive"], [role="status"], [role="alert"]')).map((el) => (el.textContent ?? "").trim()),
  );
}
