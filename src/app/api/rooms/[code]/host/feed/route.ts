import { HOST_KEY_HEADER, requireHostKey } from "@/lib/auth/hostKey";
import { handle, json } from "@/lib/errors";
import { buildHostFeed, requireRoom } from "@/lib/rooms";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  return handle(async () => {
    const room = await requireRoom((await params).code);
    requireHostKey(req, room);
    const feed = await buildHostFeed(room, req.headers.get(HOST_KEY_HEADER) ?? "");
    return json(feed, { headers: { "Cache-Control": "no-store" } });
  });
}
