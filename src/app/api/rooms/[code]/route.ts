import type { RoomInfoRes } from "@/lib/api/contracts";
import { handle, json } from "@/lib/errors";
import { getRoomInfo, requireRoom } from "@/lib/rooms";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  return handle(async () => {
    const room = await requireRoom((await params).code);
    return json({ ok: true, room: await getRoomInfo(room) } satisfies RoomInfoRes);
  });
}
