import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as storyGet } from "@/app/api/story/[showId]/route";
import OgImage, { contentType, size } from "@/app/story/[showId]/opengraph-image";
import { loadWinnerSlots } from "@/components/depth/winnerSlots";
import type { StoryRes } from "@/lib/api/contracts";
import { schema, useTestDb, type Db } from "@/lib/db/client";
import { loadStory } from "@/lib/metrics";
import { option, playedRound, receipt, round, show, user, type Fx } from "./depth-fixtures";

let db: Db;
let close: () => Promise<void>;
let live: Fx;
let demo: Fx;
let priyaId: string;

const get = (showId: string) => storyGet(new Request(`http://localhost/api/story/${showId}`), { params: Promise.resolve({ showId }) });
type Err = { ok: false; code: string; message: string };

beforeAll(async () => {
  ({ db, close } = await useTestDb());
  priyaId = await user(db, "Priya");
  const sam = await user(db, "Sam");
  const lee = await user(db, "Lee");
  const max = await user(db, "Max");
  const pancake = await user(db, "Pixel Pancake", { bot: true });
  const gone = await user(db, "Former player", { deleted: true });

  live = await show(db, {
    title: "Heist Night",
    status: "ended",
    storyTitle: "The Night the Ducks Won",
    storyTagline: "Written by everyone.",
    storyRecap: "Priya's vent plan worked, the crane came out of nowhere, and the ducks left richer.",
  });
  // Round 1: six contributors (earliest first): one is a bot, one deleted their data afterwards (idea blanked).
  const r1 = await playedRound(db, live, 1, { winnerUsers: [priyaId, sam, pancake, gone, lee, max], narration: "The crew slipped through the vents." });
  await db.update(schema.ideas).set({ status: "deleted", text: "" }).where(eq(schema.ideas.userId, gone));
  // Round 2: a wildcard with no narration yet.
  const r2 = await playedRound(db, live, 2, { winnerUsers: [sam], winnerKind: "wildcard", narration: null, status: "reveal" });
  // Round 3: voting, not revealed: must stay out of the story.
  const r3 = await round(db, live.showId, 3, { status: "vote", title: "Secret scene" });
  await option(db, r3, "A", "crowd", "Not yet");
  await receipt(db, { userId: priyaId, showId: live.showId, roundId: r1.roundId, optionId: r1.winnerId, ideaId: r1.ideaIds[0] });
  await receipt(db, { userId: priyaId, showId: live.showId, roundId: r2.roundId, optionId: r2.winnerId, ideaId: r2.ideaIds[0] });
  await receipt(db, { userId: sam, showId: live.showId, roundId: r1.roundId, optionId: r1.winnerId, ideaId: r1.ideaIds[1] });

  demo = await show(db, { title: "Demo: Space", demo: true, status: "finale" });
  await playedRound(db, demo, 1, { winnerUsers: [pancake], narration: "Beep." });
});
afterAll(() => close());

describe("GET /api/story/[showId]", () => {
  it("answers 404 with a friendly message for an unknown show", async () => {
    const res = await get("sh_doesnotexist");
    expect(res.status).toBe(404);
    const body = (await res.json()) as Err;
    expect(body).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(body.message).toMatch(/can't find that story/i);
  });

  it("answers 404 for ids that cannot be a show id", async () => {
    for (const bad of ["", "../etc/passwd", "a b", "x".repeat(65), "sh_%27or1"]) {
      expect((await get(bad)).status).toBe(404);
    }
  });

  it("returns the StoryRes shape with the show's own fields", async () => {
    const res = await get(live.showId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as StoryRes;
    expect(body.ok).toBe(true);
    expect(body.show).toMatchObject({
      id: live.showId,
      roomCode: live.code,
      title: "Heist Night",
      storyTitle: "The Night the Ducks Won",
      premise: "A vault full of rubber ducks.",
      preset: "heist",
      isDemo: false,
      tagline: "Written by everyone.",
      status: "ended",
    });
    expect(body.show.recap).toContain("vent plan");
  });

  it("lists only revealed rounds, in order, with the winner's kind and the narration", async () => {
    const { rounds } = (await (await get(live.showId)).json()) as StoryRes;
    expect(rounds.map((r) => r.roundNo)).toEqual([1, 2]); // round 3 was still being voted on
    expect(rounds[0]).toMatchObject({
      prompt: { title: "Scene 1", text: "What happens in scene 1?" },
      winner: { label: "Winner 1", kind: "crowd" },
      narration: "The crew slipped through the vents.",
    });
    expect(rounds[1]).toMatchObject({ winner: { label: "Winner 2", kind: "wildcard" }, narration: null });
    expect(JSON.stringify(rounds)).not.toContain("Secret scene");
  });

  it("takes credit names and bot flags from the database: first three by time, the rest as a count", async () => {
    const { rounds } = (await (await get(live.showId)).json()) as StoryRes;
    expect(rounds[0].credit).toEqual([
      { name: "Priya", bot: false },
      { name: "Sam", bot: false },
      { name: "Pixel Pancake", bot: true },
    ]);
    expect(rounds[0].more).toBe(2); // Lee and Max
    expect(rounds[1].credit).toEqual([{ name: "Sam", bot: false }]);
    expect(rounds[1].more).toBe(0);
  });

  it("follows a rename: names are read live from users, never stored on the round", async () => {
    await db.update(schema.users).set({ displayName: "Priya K." }).where(eq(schema.users.id, priyaId));
    const story = await loadStory(live.showId);
    expect(story?.rounds[0].credit[0].name).toBe("Priya K.");
    await db.update(schema.users).set({ displayName: "Priya" }).where(eq(schema.users.id, priyaId));
  });

  it("ranks canon makers by wins", async () => {
    const { canonMakers } = (await (await get(live.showId)).json()) as StoryRes;
    expect(canonMakers).toEqual([
      { name: "Priya", bot: false, count: 2 },
      { name: "Sam", bot: false, count: 1 },
    ]);
  });

  it("flags demo shows and their bot credits, and sends null while the recap is unwritten", async () => {
    const body = (await (await get(demo.showId)).json()) as StoryRes;
    expect(body.show.isDemo).toBe(true);
    expect(body.show.status).toBe("finale");
    expect(body.show.recap).toBeNull();
    expect(body.show.tagline).toBeNull();
    expect(body.rounds[0].credit).toEqual([{ name: "Pixel Pancake", bot: true }]);
  });
});

describe("winner letters for the story page", () => {
  it("maps each revealed round to the slot its winning option held", async () => {
    const slots = await loadWinnerSlots(live.showId);
    expect([...slots.entries()]).toEqual([
      [1, "A"],
      [2, "A"],
    ]);
  });

  it("is empty for a show with no winners and for an id that does not exist", async () => {
    expect((await loadWinnerSlots("sh_doesnotexist")).size).toBe(0);
  });
});

describe("share image (opengraph-image)", () => {
  const png = async (res: Response) => new Uint8Array(await res.arrayBuffer());
  const isPng = (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

  it("declares a 1200x630 PNG", () => {
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(contentType).toBe("image/png");
  });

  it("renders an image/png for a seeded show", async () => {
    const res = await OgImage({ params: Promise.resolve({ showId: live.showId }) });
    expect(res.headers.get("content-type")).toBe("image/png");
    const bytes = await png(res);
    expect(isPng(bytes)).toBe(true);
    expect(bytes.length).toBeGreaterThan(5_000);
  });

  it("still renders a card for a demo show and for a show that does not exist", async () => {
    for (const showId of [demo.showId, "sh_missing", "../weird"]) {
      const res = await OgImage({ params: Promise.resolve({ showId }) });
      expect(res.headers.get("content-type")).toBe("image/png");
      expect(isPng(await png(res))).toBe(true);
    }
  });
});
