// GET /api/impact: real usage only (no bots, no demo rooms), computed from the database and cached 60 s.
import { handle, json } from "@/lib/errors";
import { getImpact } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return handle(async () =>
    json(await getImpact(), { headers: { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=120" } }),
  );
}
