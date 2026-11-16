import type { TimeRes } from "@/lib/api/contracts";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json({ now: Date.now() } satisfies TimeRes, { headers: { "Cache-Control": "no-store" } });
}
