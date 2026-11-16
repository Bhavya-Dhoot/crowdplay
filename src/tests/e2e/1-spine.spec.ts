// GOAL A1, A3 (auto-advance), A4, A5 (UI side), A6, A7, A8, A9.
// A host created over the API, three phones joining through the UI and one big screen play two full rounds
// with no host input except Start (and End show at the very end).
import type { Page } from "@playwright/test";
import { expect, expectPhase, hostAction, inOrder, joinAs, optionLabel, optionPercent, phaseLog, phaseRoot, sendIdea, test, whenTextAppears } from "./fixtures";

const PHONE = { width: 390, height: 844 };
const NAMES = ["Ada Otter", "Bo Falcon", "Cy Heron"] as const;

// Each round's ideas share no words, so the three of them form three clusters: one per option.
const IDEAS = [
  ["A clown juggles stolen diamonds", "Sirens wail as lights flicker out", "Parrot recites secret passcode aloud"],
  ["Elevator plunges toward basement vault", "Detective arrives wearing pajamas", "Guard dog befriends thieves quickly"],
] as const;

test("spine: join, two auto-advancing rounds, ideas, votes, credits, receipts, restore", async ({ newContext, newApi }) => {
  const results: Record<string, unknown> = {};

  // ---- host (API) and the big screen ----
  const hostApi = await newApi("Host Harriet");
  const show = await hostApi.createShow({ title: "Spine Show", stormMs: 24_000, voteMs: 30_000, autoAdvance: true });
  const hostCalls: string[] = [];
  const host = async (action: Parameters<typeof hostAction>[1]) => {
    hostCalls.push(action.action);
    return hostAction(show, action);
  };

  const screenCtx = await newContext({ viewport: { width: 1280, height: 720 } });
  const screen = await screenCtx.newPage();
  await screen.goto(`/screen/${show.code}`);
  await expectPhase(screen, "LOBBY");
  await expect(screen.getByTestId("screen-qr").first()).toBeVisible();

  // ---- A1: landing -> joined, counted in steps ----
  const phones: Page[] = [];
  const steps: string[] = [];
  const first = await (await newContext({ viewport: PHONE })).newPage();
  phones.push(first);
  const t0 = Date.now();
  await first.goto("/");
  await first.getByRole("textbox", { name: /letter 1 of 5/ }).click();
  await first.keyboard.type(show.code);
  await first.getByRole("button", { name: "Join", exact: true }).click();
  steps.push("show code form: 5 letters + Join");
  await first.waitForURL(`**/join/${show.code}`);
  // The name box arrives pre-filled with a fun name, so typing one is optional and not a step.
  await expect(first.getByTestId("name-input")).toHaveValue(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
  await first.getByTestId("name-input").fill(NAMES[0]); // only to make the names in this test predictable
  await first.getByTestId("join-submit").click();
  steps.push("I'm in");
  await first.waitForURL(`**/play/${show.code}`);
  await expectPhase(first, "LOBBY");
  results.joinedAfterMs = Date.now() - t0;

  for (const name of NAMES.slice(1)) {
    const page = await (await newContext({ viewport: PHONE })).newPage();
    phones.push(page);
    await joinAs(page, show.code, name);
  }
  const [p1, p2, p3] = phones;
  await expect(p1.getByTestId("player-count")).toContainText("3");

  // ---- start: the only host input of the show ----
  await host({ action: "start" });
  await Promise.all([...phones, screen].map((p) => expectPhase(p, "STORM")));

  // The idea box is the third step: landing -> code -> I'm in -> idea.
  const latencies: number[] = [];
  const feedOf = (page: Page) => ({ page, selector: '[data-testid="feed-item"]' });
  const rainOf = { page: screen, selector: '[data-testid="screen-rain-item"]' };

  async function sendAndMeasure(from: Page, text: string): Promise<void> {
    const watchers = [...phones.filter((p) => p !== from).map(feedOf), rainOf];
    const seen = watchers.map((w) => whenTextAppears(w.page, text, w.selector));
    const sentAt = await sendIdea(from, text);
    for (const at of await Promise.all(seen)) latencies.push(at - sentAt);
  }

  // ---- round 1 ----
  await sendAndMeasure(p1, IDEAS[0][0]);
  steps.push("type an idea");
  expect(steps.length, `meaningful steps from landing to a typed idea: ${steps.join(" -> ")}`).toBeLessThanOrEqual(3);
  await sendAndMeasure(p2, IDEAS[0][1]);
  await sendAndMeasure(p3, IDEAS[0][2]);

  // A4 (feeds): everyone sees all three ideas; the big screen rains all three.
  for (const p of phones) await expect(p.getByTestId("feed-item")).toHaveCount(3);
  await expect(screen.getByTestId("screen-rain-item")).toHaveCount(3);
  await expect(p1.getByTestId("feed-item").filter({ hasText: IDEAS[0][0] })).toHaveAttribute("data-mine", "1");

  await Promise.all([...phones, screen].map((p) => expectPhase(p, "VOTE")));
  await voteRound(1);

  // ---- round 2 (late join and reload happen inside it) ----
  await Promise.all([...phones, screen].map((p) => expectPhase(p, "STORM")));
  await expect(phaseRoot(p1)).toHaveAttribute("data-round", "2");

  const late = await (await newContext({ viewport: PHONE })).newPage();
  const lateRestore = (async () => {
    await late.goto(`/join/${show.code}`);
    await late.getByTestId("name-input").fill("Di Quokka");
    await late.getByTestId("join-submit").click();
    const clickAt = await late.evaluate(() => window.__cpClickAt ?? 0);
    await late.waitForURL(`**/play/${show.code}`);
    // The show may have moved on while the guest joined: the page has to show whatever is current.
    await expect(phaseRoot(late)).not.toHaveAttribute("data-phase", "LOADING");
    const phase = await phaseRoot(late).getAttribute("data-phase");
    const shown = (await phaseLog(late)).find((e) => e.phase === phase);
    expect(shown, `late joiner rendered ${phase}`).toBeDefined();
    return { ms: (shown?.at ?? 0) - clickAt, phase };
  })();

  await sendAndMeasure(p1, IDEAS[1][0]);
  await sendAndMeasure(p2, IDEAS[1][1]);
  await sendAndMeasure(p3, IDEAS[1][2]);
  const joined = await lateRestore;
  results.lateJoinRestoreMs = joined.ms;
  expect(joined.ms, `late joiner saw ${joined.phase} after`).toBeLessThanOrEqual(2000);
  const serverPhase = (await hostApi.state(show.code)).phase;
  expect(["STORM", "DISTILL", "VOTE"]).toContain(joined.phase);
  expect(serverPhase).toBeDefined();

  await Promise.all([...phones, screen].map((p) => expectPhase(p, "VOTE")));

  // A9: a reload in the middle of a vote restores the phase and my vote within 2 s.
  await p2.getByTestId("option-B").click();
  await expect(p2.getByTestId("option-B")).toHaveAttribute("data-selected", "1");
  await expect.poll(async () => (await hostApi.state(show.code)).votesTotal).toBe(1);
  const reloadAt = Date.now();
  await p2.reload();
  await expectPhase(p2, "VOTE", 2000);
  const restored = (await phaseLog(p2)).find((e) => e.phase === "VOTE");
  results.reloadRestoreMs = (restored?.at ?? Infinity) - reloadAt;
  expect(results.reloadRestoreMs, "reload restores the phase").toBeLessThanOrEqual(2000);
  await expect(p2.getByTestId("option-B")).toHaveAttribute("data-selected", "1", { timeout: 2000 });

  await Promise.all([...phones, screen].map((p) => expectPhase(p, "REVEAL")));
  await expectReveal(2);

  // ---- A3 (auto): every phase of both rounds came from the clock, not from the host ----
  const sequence = (await phaseLog(p1)).map((e) => `${e.phase}${e.round}`);
  expect(
    inOrder(sequence, ["PROMPT1", "STORM1", "DISTILL1", "VOTE1", "REVEAL1", "PROMPT2", "STORM2", "DISTILL2", "VOTE2", "REVEAL2"]),
    sequence.join(" "),
  ).toBe(true);
  const onScreen = (await phaseLog(screen)).map((e) => e.phase);
  expect(inOrder(onScreen, ["PROMPT", "STORM", "DISTILL", "VOTE", "REVEAL", "PROMPT", "STORM", "DISTILL", "VOTE", "REVEAL"])).toBe(true);
  expect(hostCalls).toEqual(["start"]);
  // DISTILL is on screen for real (the e2e server's mock distiller thinks for 1.5 s).
  const log = await phaseLog(screen);
  const d = log.findIndex((e) => e.phase === "DISTILL");
  results.distillOnScreenMs = log[d + 1].at - log[d].at;
  expect(results.distillOnScreenMs).toBeGreaterThanOrEqual(1000);

  // ---- finish: end the show and read the receipts on /me ----
  await host({ action: "endShow" });
  await Promise.all(phones.map((p) => expectPhase(p, "FINALE")));
  await expect(p1.getByTestId("finale-title")).toBeVisible();

  let canon = 0;
  for (const [i, p] of phones.entries()) {
    const me = await p.context().newPage();
    await me.goto("/me");
    await expect(me.getByTestId("receipt").first()).toBeVisible();
    await expect(me.getByTestId("receipt").and(me.locator('[data-type="BALLOT"]'))).toHaveCount(2); // one per round
    canon += await me.locator('[data-testid="receipt"][data-type="CANON"]').count();
    await expect(me.getByTestId("receipt").filter({ hasText: IDEAS[0][i] })).not.toHaveCount(0);
    await expect(me.getByTestId("me-stats")).toContainText("Ideas sent");
    await me.close();
  }
  expect(canon, "one CANON receipt per round, listed on /me").toBe(2);

  // A4: every idea reached every other feed and the big screen inside a second.
  const sorted = [...latencies].sort((a, b) => a - b);
  results.ideaLatencyMs = { samples: sorted.length, median: sorted[Math.floor(sorted.length / 2)], max: sorted[sorted.length - 1] };
  expect(sorted.length).toBe(18);
  expect(sorted[sorted.length - 1], "slowest idea delivery").toBeLessThan(1000);
  console.log("SPINE_RESULTS", JSON.stringify(results));

  // ---------- helpers that need the closure ----------

  /** Both votes and the live bars, then the reveal, credits and receipts of round 1. */
  async function voteRound(round: 1): Promise<void> {
    void round;
    // A5: exactly three options, A and B from the crowd, C the wildcard.
    for (const p of phones) {
      await expect(p.locator('[data-testid^="option-"]')).toHaveCount(3);
      await expect(p.getByTestId("option-C")).toContainText("Wildcard");
      await expect(p.getByTestId("option-A")).not.toContainText("Wildcard");
      await expect(p.getByTestId("option-B")).not.toContainText("Wildcard");
    }
    const ballot = (await hostApi.state(show.code)).options ?? [];
    expect(ballot.map((o) => `${o.slot}:${o.kind}`)).toEqual(["A:crowd", "B:crowd", "C:wildcard"]);
    for (const o of ballot) {
      // The label on every phone is the label the server holds.
      expect(await optionLabel(p3, o.slot)).toBe(o.label);
      await expect(screen.getByTestId(`screen-option-${o.slot}`)).toContainText(o.label);
    }

    // BALLOT receipts: all three ideas are on the ballot, so every player gets the gold toast.
    for (const [i, p] of phones.entries()) {
      const toast = p.locator(".toast-receipt");
      await expect(toast.first()).toContainText("Your idea is on the ballot");
      await expect(toast.first()).toContainText(IDEAS[0][i]);
      // "✨ Yours": exactly one option carries this player's idea.
      await expect(p.locator('[data-testid^="option-"][data-mine="1"]')).toHaveCount(1);
    }

    // A6: one vote each, changeable, bars follow the tally.
    await p1.getByTestId("option-A").click();
    await expect(p1.getByTestId("option-A")).toHaveAttribute("data-selected", "1");
    await expect.poll(() => optionPercent(p2, "A")).toBe(100);
    await expect(screen.getByTestId("screen-option-A")).toHaveAttribute("aria-label", /100 percent/);
    await p1.getByTestId("option-B").click(); // change of mind
    await expect(p1.getByTestId("option-B")).toHaveAttribute("data-selected", "1");
    await expect(p1.getByTestId("option-A")).not.toHaveAttribute("data-selected", "1");
    await expect.poll(() => optionPercent(p2, "B")).toBe(100);
    expect(await optionPercent(p2, "A")).toBe(0);
    await p2.getByTestId("option-B").click();
    await p3.getByTestId("option-C").click();
    await expect.poll(() => optionPercent(p1, "B")).toBe(67);
    await expect.poll(() => optionPercent(p1, "C")).toBe(33);
    await expect(screen.getByTestId("screen-option-B")).toHaveAttribute("aria-label", /67 percent/);
    expect((await hostApi.state(show.code)).votesTotal).toBe(3); // three people, three votes: a change is not a second vote

    await Promise.all([...phones, screen].map((p) => expectPhase(p, "REVEAL")));
    await expectReveal(1);
  }

  /** A7 and A8 for one round: narration, credit line with database names, canon moment only for the credited player. */
  async function expectReveal(round: 1 | 2): Promise<void> {
    const state = await hostApi.state(show.code);
    expect(state.roundNo).toBe(round);
    const outcome = state.outcome;
    expect(outcome, "outcome in REVEAL").toBeDefined();
    const winner = state.options?.find((o) => o.id === outcome?.optionId);
    expect(winner).toBeDefined();
    if (round === 1) expect(winner?.slot).toBe("B"); // 2 of 3 votes

    const credited = outcome?.credit ?? [];
    expect(credited.length).toBeGreaterThanOrEqual(1);
    for (const c of credited) expect([...NAMES], "credit names come from the database").toContain(c.name);

    for (const p of phones) {
      await expect(p.getByTestId("winner")).toBeVisible();
      await expect(p.getByTestId("narration")).toContainText(/\S{3,}/);
      for (const c of credited) await expect(p.getByTestId("credits")).toContainText(`@${c.name}`);
    }
    for (const c of credited) await expect(screen.getByTestId("screen-credits")).toContainText(`@${c.name}`);
    await expect(screen.getByTestId("narration")).toContainText(/\S{3,}/);

    // The credited player gets the full-screen canon moment; the others do not.
    const creditedPages = phones.filter((_, i) => credited.some((c) => c.name === NAMES[i]));
    expect(creditedPages.length).toBeGreaterThanOrEqual(1);
    for (const p of creditedPages) {
      await expect(p.getByTestId("receipt-moment")).toBeVisible({ timeout: 6000 });
      await expect(p.getByTestId("receipt-moment")).toContainText("Your idea became canon");
    }
    for (const p of phones.filter((q) => !creditedPages.includes(q))) {
      await expect(p.getByTestId("receipt-moment")).toHaveCount(0);
    }
    // ... which then collapses into the gold toast.
    for (const p of creditedPages) {
      await expect(p.getByTestId("receipt-moment")).toBeHidden({ timeout: 6000 });
      await expect(p.locator(".toast-receipt").filter({ hasText: "became canon" }).first()).toBeVisible();
    }
  }
});
