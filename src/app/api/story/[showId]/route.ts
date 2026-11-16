// GET /api/story/:showId: recap data for the story page (rounds, winners, narration, credits from the database).
import { AppError, handle, json } from "@/lib/errors";
import { loadStory } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ showId: string }> }): Promise<Response> {
  return handle(async () => {
    const story = await loadStory((await params).showId);
    if (!story) throw new AppError("NOT_FOUND", "We can't find that story. Check the link and try again.", 404);
    return json(story, { headers: { "Cache-Control": "public, max-age=0, s-maxage=15, stale-while-revalidate=30" } });
  });
}
