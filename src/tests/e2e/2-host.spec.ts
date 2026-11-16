// GOAL A3 (manual), C2 and C3: a show driven by hand from the /host/CODE console with auto-advance off.
// Start, pause/resume, delete an idea, mute, ban, end the storm, veto, re-roll (once), force a winner, hold at
// REVEAL, then end the show.
import type { Page } from "@playwright/test";
import { expect, expectPhase, hostFeed, joinAs, lastClickAt, phaseLog, sendIdea, test, whenOptionLabelChanges, optionLabel } from "./fixtures";

const PHONE = { width: 390, height: 844 };

const IDEA = {
  ada: ["Elevator plunges toward basement vault", "Moon rocks rain down indoors", "Spare unwanted pigeon"],
  bo: ["Detective arrives wearing pajamas", "Mime trapped inside invisible box"],
  cy: ["Guard dog befriends thieves quickly", "Cy's second idea never counts"],
  di: ["Sirens wail as lights flicker out", "Di's second idea never counts"],
} as const;

test("host: run a whole round by hand from the console", async ({ newContext, newApi, guard }) => {
  const results: Record<string, unknown> = {};
  const hostApi = await newApi("Host Harriet");
  const show = await hostApi.createShow({ title: "Manual Mayhem", stormMs: 40_000, voteMs: 40_000, autoAdvance: false });

  // ---- host console, big screen, four phones ----
  const hostPage = await (await newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await hostPage.goto(`/host/${show.code}?k=${encodeURIComponent(show.hostKey)}`);
  await expectPhase(hostPage, "LOBBY");
  await expect(hostPage.getByTestId("host-code")).toContainText(show.code);
  await expect(hostPage.getByTestId("host-auto")).toHaveAttribute("aria-checked", "false");

  const screen = await (await newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await screen.goto(`/screen/${show.code}`);
  await expectPhase(screen, "LOBBY");

  const ctxOf: Record<string, Awaited<ReturnType<typeof newContext>>> = {};
  const pages: Record<string, Page> = {};
  for (const name of ["ada", "bo", "cy", "di"] as const) {
    ctxOf[name] = await newContext({ viewport: PHONE });
    pages[name] = await ctxOf[name].newPage();
    await joinAs(pages[name], show.code, { ada: "Ada Otter", bo: "Bo Falcon", cy: "Cy Heron", di: "Di Quokka" }[name]);
  }
  const phones = Object.values(pages);
  const stayers = [pages.ada, pages.bo, pages.di]; // Cy is removed below: his page turns into the removal message
  await expect(hostPage.getByTestId("host-player")).toHaveCount(4);
  const userId = async (name: string) => {
    const p = (await hostFeed(show)).players.find((x) => x.name === name);
    expect(p, `${name} in the host feed`).toBeDefined();
    return p?.userId ?? "";
  };
  const ids = { cy: await userId("Cy Heron"), di: await userId("Di Quokka") };

  // ---- A3 manual: nothing moves until the host presses the stage key ----
  await expect(hostPage.getByTestId("host-primary")).toHaveText(/Start show/);
  await hostPage.getByTestId("host-primary").click();
  await Promise.all([hostPage, screen, ...phones].map((p) => expectPhase(p, "PROMPT")));
  await Promise.all([hostPage, screen, ...phones].map((p) => expectPhase(p, "STORM"))); // the scene card still times out by itself
  // Three +10 s keep the storm open while the moderation below happens.
  for (let i = 0; i < 3; i++) await hostPage.getByTestId("host-extend").click();

  // ---- ideas from four players ----
  await sendIdea(pages.ada, IDEA.ada[0]);
  await sendIdea(pages.bo, IDEA.bo[0]);
  await sendIdea(pages.cy, IDEA.cy[0]);
  await sendIdea(pages.di, IDEA.di[0]);
  await expect(hostPage.getByTestId("host-idea")).toHaveCount(4);
  await expect(hostPage.getByTestId("host-idea-count")).toContainText("4 ideas");
  await expect(screen.getByTestId("screen-rain-item")).toHaveCount(4);

  // Delete an idea: it leaves the big screen.
  await sendIdea(pages.ada, IDEA.ada[2]);
  const spare = screen.getByTestId("screen-rain-item").filter({ hasText: IDEA.ada[2] });
  await expect(spare).toHaveCount(1);
  const spareRow = hostPage.getByTestId("host-idea").filter({ hasText: IDEA.ada[2] });
  await spareRow.locator('[data-testid^="idea-delete-"]').click();
  await expect(spare).toHaveCount(0);
  await expect(spareRow).toHaveAttribute("data-status", "deleted");
  await expect(pages.bo.getByTestId("feed-item").filter({ hasText: IDEA.ada[2] })).toHaveCount(0);

  // Two more real ideas so the AI has backups to offer later.
  await sendIdea(pages.bo, IDEA.bo[1]);
  await sendIdea(pages.ada, IDEA.ada[1]);

  // ---- C3: mute Di, ban Cy ----
  guard.expectHttpError(403, /^\/api\/mock\/send$/, "a muted or banned player's idea is refused over the transport");
  guard.expectHttpError(403, /^\/api\/rooms\/[A-Z]{5}\/ideas$/, "a muted or banned player's idea is refused over HTTP");

  await hostPage.getByTestId(`mute-${ids.di}`).click();
  await expect(hostPage.getByTestId(`mute-${ids.di}`)).toHaveAttribute("aria-pressed", "true");
  await sendIdea(pages.di, IDEA.di[1]);
  await expect(pages.di.getByTestId("feed-item").filter({ hasText: IDEA.di[1] })).toHaveAttribute("data-status", "rejected");
  await expect(pages.di.getByRole("alert").filter({ hasText: "The host muted you" })).toBeVisible();

  await hostPage.getByTestId(`ban-${ids.cy}`).click();
  await expect(hostPage.getByTestId(`ban-${ids.cy}`)).toHaveAttribute("aria-pressed", "true");
  await expect(screen.getByTestId("screen-rain-item").filter({ hasText: IDEA.cy[0] })).toHaveCount(0); // gone from the big screen
  await sendIdea(pages.cy, IDEA.cy[1]);
  await expect(pages.cy.getByTestId("feed-item").filter({ hasText: IDEA.cy[1] })).toHaveAttribute("data-status", "rejected");
  await expect(pages.cy.getByRole("alert").filter({ hasText: "You've been removed from this show." })).toBeVisible();

  // Server side: neither refused idea exists, the banned player's earlier idea is out of the round, and a direct
  // API call from the banned browser session is refused too.
  const feed = await hostFeed(show);
  const texts = feed.ideas.filter((i) => i.status === "ok").map((i) => i.text);
  expect(texts).not.toContain(IDEA.di[1]);
  expect(texts).not.toContain(IDEA.cy[1]);
  expect(texts).not.toContain(IDEA.cy[0]);
  expect(feed.ideas.find((i) => i.text === IDEA.cy[0])?.status).toBe("blocked");
  expect(feed.players.find((p) => p.userId === ids.cy)?.banned).toBe(true);
  expect(feed.players.find((p) => p.userId === ids.di)?.muted).toBe(true);
  const direct = await ctxOf.cy.request.post(`/api/rooms/${show.code}/ideas`, {
    data: { roundNo: 1, text: "Banned but trying the API", clientMsgId: "e2ebanned0001" },
  });
  expect(direct.status()).toBe(403);
  expect((await direct.json()).code).toBe("BANNED");
  expect((await hostFeed(show)).ideas.map((i) => i.text)).not.toContain("Banned but trying the API");

  // ---- pause / resume: the overlay shows on the phone, the big screen and the console ----
  await hostPage.getByTestId("host-pause").click();
  await expect(pages.ada.getByTestId("paused-overlay")).toBeVisible();
  await expect(screen.getByTestId("screen-paused")).toBeVisible();
  await expect(hostPage.getByTestId("host-status")).toContainText("Paused");
  await expect(hostPage.getByTestId("host-primary")).toBeDisabled();
  await expect(pages.ada.getByTestId("idea-input")).toBeDisabled();
  await hostPage.getByTestId("host-pause").click(); // now "Resume"
  await expect(pages.ada.getByTestId("paused-overlay")).toBeHidden();
  await expect(screen.getByTestId("screen-paused")).toBeHidden();
  await expect(hostPage.getByTestId("host-status")).toContainText("Idea storm");

  // ---- end the storm by hand ----
  await expect(hostPage.getByTestId("host-primary")).toHaveText(/End storm now/);
  await hostPage.getByTestId("host-primary").click();
  await Promise.all([hostPage, screen, ...stayers].map((p) => expectPhase(p, "VOTE")));
  const distillOnHost = (await phaseLog(hostPage)).map((e) => e.phase);
  expect(distillOnHost).toContain("DISTILL");

  // The banned player now sees the removal as a full-screen message; the muted one can still vote.
  await expect(pages.cy.getByText("You've been removed from this show.").first()).toBeVisible();
  for (const p of stayers) await expect(p.locator('[data-testid^="option-"]')).toHaveCount(3);
  await hostPage.getByTestId("host-extend").click();
  await hostPage.getByTestId("host-extend").click();
  await pages.di.getByTestId("option-A").click();
  await expect(pages.di.getByTestId("option-A")).toHaveAttribute("data-selected", "1");
  await expect(hostPage.getByTestId("host-option-A")).toContainText("1 vote");

  // ---- C2: veto replaces an option on the phones within 3 s ----
  const oldLabel = await optionLabel(pages.ada, "B");
  const vetoId = (await hostPage.getByTestId("host-option-B").getAttribute("data-option-id")) ?? "";
  expect(vetoId).not.toBe("");
  const changed = Promise.all(stayers.map((p) => whenOptionLabelChanges(p, "B", oldLabel)));
  await hostPage.getByTestId(`veto-${vetoId}`).click();
  const clickedAt = await lastClickAt(hostPage);
  const swaps = (await changed).map((at) => at - clickedAt);
  results.vetoReplacementMs = Math.max(...swaps);
  expect(results.vetoReplacementMs, "veto -> new option B on every phone").toBeLessThan(3000);
  const afterVeto = (await hostApi.state(show.code)).options ?? [];
  expect(afterVeto.map((o) => o.slot)).toEqual(["A", "B", "C"]);
  expect(afterVeto.find((o) => o.slot === "B")?.label).not.toBe(oldLabel);
  expect(afterVeto.find((o) => o.slot === "B")?.id).not.toBe(vetoId);

  // ---- re-roll: once ----
  const beforeReroll = afterVeto.map((o) => o.label);
  await expect(hostPage.getByTestId("host-reroll")).toBeEnabled();
  await expect(hostPage.getByTestId("host-reroll")).toContainText("1 left");
  await hostPage.getByTestId("host-reroll").click();
  await expect.poll(async () => (await phaseLog(hostPage)).filter((e) => e.phase === "DISTILL").length).toBe(2);
  await Promise.all([hostPage, ...stayers].map((p) => expectPhase(p, "VOTE")));
  await expect(hostPage.getByTestId("host-reroll")).toBeDisabled();
  await expect(hostPage.getByTestId("host-reroll")).toContainText("Re-roll used");
  const rerolled = await hostApi.state(show.code);
  expect(rerolled.options?.map((o) => o.label)).not.toEqual(beforeReroll);
  // Three slots again. With only five clusters in the room the re-roll may have to fill one with a narrator pick (FR-16).
  expect(rerolled.options?.map((o) => o.slot)).toEqual(["A", "B", "C"]);
  expect(rerolled.options?.slice(0, 2).map((o) => o.kind)).toEqual(["crowd", "crowd"]);
  expect(["wildcard", "narrator"]).toContain(rerolled.options?.[2].kind);
  // A second re-roll over the API is refused and the ballot stays as it is.
  const again = await hostApi.post<{ ok: boolean; code?: string }>(`/api/rooms/${show.code}/host`, { action: "reroll" }, { "x-host-key": show.hostKey });
  expect(again.status).toBe(409);
  expect(again.body.code).toBe("REROLL_USED");
  const stillThere = await hostApi.state(show.code);
  expect(stillThere.phase).toBe("VOTE");
  expect(stillThere.options?.map((o) => o.label)).toEqual(rerolled.options?.map((o) => o.label));
  expect((await hostFeed(show)).metrics.rerollUsed).toBe(true);

  // ---- force win: the host's pick beats the crowd's ----
  await pages.ada.getByTestId("option-A").click();
  await pages.bo.getByTestId("option-B").click();
  await expect(hostPage.getByTestId("host-option-A")).toContainText("1 vote");
  const wildcard = rerolled.options?.find((o) => o.slot === "C"); // the option the host crowns, whatever its kind
  expect(wildcard).toBeDefined();
  await hostPage.getByTestId(`forcewin-${wildcard?.id}`).click();
  await Promise.all([hostPage, screen, ...stayers].map((p) => expectPhase(p, "REVEAL")));
  const final = await hostApi.state(show.code);
  expect(final.outcome?.optionId).toBe(wildcard?.id);
  await expect(screen.getByTestId("screen-option-C")).toHaveAttribute("data-role", "winner");
  await expect(pages.ada.getByTestId("winner")).toContainText(wildcard?.label ?? "?");
  await expect(pages.ada.getByTestId("narration")).toContainText(/\S{3,}/);

  // ---- manual REVEAL holds for the host (with auto-advance it would leave after 3.6 s) ----
  await expect(hostPage.getByTestId("host-primary")).toHaveText(/Next round/);
  // Negative check, so a fixed wait is the only way: the phase must still be REVEAL well past the auto timer.
  await hostPage.waitForTimeout(5000);
  await expectPhase(pages.ada, "REVEAL", 500);
  await expectPhase(screen, "REVEAL", 500);

  await hostPage.getByTestId("host-primary").click();
  await Promise.all([hostPage, screen, ...stayers].map((p) => expectPhase(p, "PROMPT")));

  // ---- finish by hand: End show -> FINALE (waits for the host) -> End show -> ENDED ----
  await hostPage.getByTestId("host-end").click();
  await hostPage.getByTestId("host-end-confirm").click();
  await Promise.all([hostPage, screen, ...stayers].map((p) => expectPhase(p, "FINALE")));
  await expect(hostPage.getByTestId("host-primary")).toHaveText(/End show/);
  await hostPage.getByTestId("host-primary").click();
  await expectPhase(hostPage, "ENDED");
  await expect(hostPage.getByTestId("host-ended-card")).toBeVisible();

  console.log("HOST_RESULTS", JSON.stringify(results));
});
