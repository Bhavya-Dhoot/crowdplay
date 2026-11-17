// The depth pages rendered to HTML on the server, against a real (in-memory) database: what a visitor would
// see, without a browser. Covers the honest empty state, the demo/bot labelling and the admin gate.
import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import AdminPage from "@/app/admin/page";
import HowItWorks from "@/app/how-it-works/page";
import ImpactPage from "@/app/impact/page";
import StoryPage from "@/app/story/[showId]/page";
import { resetConfig } from "@/lib/config";
import { COPY } from "@/lib/copy";
import { schema, useTestDb, type Db } from "@/lib/db/client";
import { resetMetricsCache } from "@/lib/metrics";
import { playedRound, receipt, show, user, vote } from "./depth-fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
  notFound: () => {
    throw Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  },
}));

let db: Db;
let close: () => Promise<void>;

const html = (el: unknown) => renderToStaticMarkup(el as Parameters<typeof renderToStaticMarkup>[0]);
const impact = async () => html(await ImpactPage());
const admin = async (token?: string) => html(await AdminPage({ searchParams: Promise.resolve(token === undefined ? {} : { token }) }));
const story = async (showId: string) => html(await StoryPage({ params: Promise.resolve({ showId }) }));

beforeAll(async () => {
  ({ db, close } = await useTestDb());
});
afterAll(async () => {
  delete process.env.ADMIN_TOKEN;
  resetConfig();
  await close();
});
beforeEach(() => resetMetricsCache());
afterEach(() => {
  delete process.env.ADMIN_TOKEN;
  resetConfig();
});

describe("/impact", () => {
  it("shows an honest empty state, with no figures and the exclusion note", async () => {
    const out = await impact();
    expect(out).toContain("No real show has been played yet.");
    expect(out).toContain("Bots and demo rooms excluded. Numbers come straight from the database.");
    expect(out).not.toContain("<table");
    expect(out).not.toContain("Ideas written");
    expect(out).not.toContain("Median distill time");
    expect(out).toContain('href="/host"');
  });

  it("offers the next step from the empty state: host a show, or play the demo (which does not count)", async () => {
    const out = await impact();
    expect(out).toContain("Host a show, add yours");
    expect(out).toContain('href="/try"');
    expect(out).toContain(COPY.landing.try.label);
    expect(out).toContain("never show up here");
  });

  it("shows big numbers and a session table once a real show exists", async () => {
    const ann = await user(db, "Ann");
    const fx = await show(db, { title: "Friday Heist Night", status: "ended" });
    const p = await playedRound(db, fx, 1, { winnerUsers: [ann], distillMs: 2400 });
    await vote(db, p.roundId, ann, p.winnerId);
    const out = await impact();
    expect(out).not.toContain("No real show has been played yet.");
    expect(out).toContain("Real people");
    expect(out).toContain("Median distill time");
    expect(out).toContain("2.4 s");
    expect(out).toContain("Within the 8 s target");
    expect(out).toContain("Friday Heist Night");
    expect(out).toContain(`/story/${fx.showId}`);
    expect(out).toContain("Bots and demo rooms excluded. Numbers come straight from the database.");
  });
});

describe("/how-it-works", () => {
  const out = html(createElement(HowItWorks));

  it("has the loop, the architecture diagram with a text alternative, and the Feature to Nexconn table", () => {
    for (const step of ["Prompt", "Storm", "Distill", "Vote", "Reveal", "Finale"]) expect(out).toContain(step);
    expect(out).toContain('role="img"');
    expect(out).toContain('<title id="arch-title">CrowdPlay architecture</title>');
    expect(out).toContain('id="arch-desc"');
    expect(out).toContain("Follow one idea");
    for (const feature of [
      "Zero-signup join",
      "The live room",
      "Idea storm",
      "Live vote bars",
      "Narrator and bots",
      "Moderation",
      "Server learns about messages",
      "Reconnect banner",
    ]) {
      expect(out).toContain(feature);
    }
    expect(out).toContain("CP:Idea");
    expect(out).toContain("CP:Receipt");
  });

  it("covers what is new, safety and the limits, including what was not load-tested live", () => {
    expect(out).toContain("Options written by the crowd");
    expect(out).toContain("A guaranteed minority slot");
    expect(out).toContain("Personal receipts");
    expect(out).toContain("Safety, in three layers");
    expect(out).toContain("500 connections");
    expect(out).toContain("Mock transport");
    expect(out).toContain("only in demo rooms");
    expect(out).toContain("Not load-tested live");
  });

  it("states the live-verified Nexconn results exactly as docs/VERIFICATION.md records them", () => {
    expect(out).toContain("13 of 14 samples");
    expect(out).toContain("0.93 to 1.04 seconds");
    expect(out).toContain("2.8 to 3.1 seconds");
    expect(out).toContain("300-sender load test runs on the mock transport");
    expect(out).toContain("the server&#x27;s own filter is the one that decides");
  });
});

describe("/admin", () => {
  it("says admin is off when ADMIN_TOKEN is unset", async () => {
    const out = await admin("anything");
    expect(out).toContain("Admin is switched off");
    expect(out).toContain("ADMIN_TOKEN");
    expect(out).not.toContain("Download CSV");
  });

  it("refuses a missing or wrong token with a friendly page and no data", async () => {
    process.env.ADMIN_TOKEN = "letmein-letmein-letmein";
    resetConfig();
    for (const token of [undefined, "", "wrong"]) {
      const out = await admin(token);
      expect(out).toContain("That admin link doesn&#x27;t work");
      expect(out).not.toContain("Download CSV");
      expect(out).not.toContain("Friday Heist Night");
    }
  });

  it("lists sessions (demo ones labelled), the CSV link and the read-only flags for the right token", async () => {
    process.env.ADMIN_TOKEN = "letmein-letmein-letmein";
    resetConfig();
    const demo = await show(db, { title: "Demo: Space", demo: true, status: "ended" });
    const bot = await user(db, "Pixel Pancake", { bot: true });
    await playedRound(db, demo, 1, { winnerUsers: [bot] });
    const out = await admin("letmein-letmein-letmein");
    expect(out).toContain("Download CSV");
    expect(out).toContain("/api/admin/export?token=letmein-letmein-letmein");
    expect(out).toContain("Friday Heist Night");
    expect(out).toContain("Demo: Space");
    expect(out).toContain(">Demo<");
    expect(out).toContain("Emoji cheers (FEATURE_CHEERS)");
    expect(out).toContain("Realtime transport (REALTIME_MODE)");
    expect(out).not.toContain("ANTHROPIC_API_KEY");
  });
});

describe("/story/[showId]", () => {
  it("renders title, premise, rounds, narration and credits, and offers to host your own", async () => {
    const priya = await user(db, "Priya");
    const fx = await show(db, { title: "Space Night", status: "ended", storyTitle: "Lost Among the Stars", storyTagline: "A crew, a comet, a mistake.", storyRecap: "They flew toward the comet." });
    await playedRound(db, fx, 1, { winnerUsers: [priya], narration: "The ship turned toward the light." });
    const out = await story(fx.showId);
    expect(out).toContain("Lost Among the Stars");
    expect(out).toContain("A crew, a comet, a mistake.");
    expect(out).toContain("A vault full of rubber ducks.");
    expect(out).toContain("They flew toward the comet.");
    expect(out).toContain("The ship turned toward the light.");
    expect(out).toContain("@Priya");
    expect(out).toContain("Share story");
    expect(out).toContain("Host your own");
    expect(out).not.toContain("Demo show.");
  });

  it("lays the story out as a poster: numbered scene boxes with the winning line, its letter and a CANON ribbon, a byline and a cast list", async () => {
    const lee = await user(db, "Lee");
    const fx = await show(db, { title: "Script Night", status: "ended", storyRecap: "A recap." });
    const p = await playedRound(db, fx, 1, { winnerUsers: [lee], narration: "The lights came up." });
    await receipt(db, { userId: lee, showId: fx.showId, roundId: p.roundId, optionId: p.winnerId, ideaId: p.ideaIds[0] });
    const out = await story(fx.showId);
    expect(out).toContain("Scene 1");
    expect(out).toContain("Winning line");
    expect(out).toContain('data-slot="A"'); // the fixture's winner sat in slot A
    expect(out).toContain("banner-yellow"); // the numbered scene banner
    expect(out).toContain('class="banner-face">Canon<'); // the crowd's winner carries the CANON ribbon
    expect(out).toContain("Winner 1");
    expect(out).toContain("Written by");
    expect(out).toContain("@Lee");
    expect(out).toContain(">Cast<");
    expect(out).toContain("1 win");
  });

  it("shows no letter, and no error, for a winner whose slot is unknown", async () => {
    const ann = await user(db, "Ann");
    const fx = await show(db, { title: "Backup Night", status: "ended", storyRecap: "A recap." });
    const p = await playedRound(db, fx, 1, { winnerUsers: [ann] });
    await db.update(schema.options).set({ slot: null }).where(eq(schema.options.id, p.winnerId));
    const out = await story(fx.showId);
    expect(out).toContain("Winner 1");
    expect(out).not.toContain("data-slot=");
  });

  it("gives a wildcard or narrator winner its own ribbon, and the CANON ribbon only to the crowd's", async () => {
    const ann = await user(db, "Ann");
    const fx = await show(db, { title: "Ribbon Night", status: "ended", storyRecap: "A recap." });
    await playedRound(db, fx, 1, { winnerUsers: [ann], winnerKind: "wildcard" });
    await playedRound(db, fx, 2, { winnerUsers: [], winnerKind: "narrator" });
    const out = await story(fx.showId);
    expect(out).toContain('class="banner-face">Wildcard<');
    expect(out).toContain("Narrator&#x27;s pick");
    expect(out).not.toContain('class="banner-face">Canon<');
  });

  it("labels a demo show and puts the robot badge after every bot name", async () => {
    const bot = await user(db, "Captain Noodle", { bot: true });
    const fx = await show(db, { title: "Demo: Heist", demo: true, status: "ended", storyRecap: "Beep boop." });
    await playedRound(db, fx, 1, { winnerUsers: [bot], narration: "Beep." });
    const out = await story(fx.showId);
    expect(out).toContain("Demo show.");
    expect(out).toContain("simulated");
    expect(out).toContain('class="banner-face">Demo<'); // the DEMO ribbon
    const names = out.match(/@Captain Noodle/g)?.length ?? 0;
    const badges = out.match(/aria-label="Simulated player \(demo room\)"/g)?.length ?? 0;
    expect(names).toBeGreaterThan(0);
    expect(badges).toBeGreaterThanOrEqual(names); // every credited bot name is followed by a badge (the canon list adds more)
  });

  it("says the narrator is still writing while the recap is empty", async () => {
    const ann = await user(db, "Ann");
    const fx = await show(db, { title: "Fresh finale", status: "finale" });
    await playedRound(db, fx, 1, { winnerUsers: [ann] });
    const out = await story(fx.showId);
    expect(out).toContain("The narrator is writing the recap");
    expect(out).toContain('aria-busy="true"');
  });

  it("falls through to the not-found page for an unknown show", async () => {
    await expect(story("sh_nope")).rejects.toThrow(/404/);
  });
});
