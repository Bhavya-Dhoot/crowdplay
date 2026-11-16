import { CreateRoomBody, type CreateRoomRes } from "@/lib/api/contracts";
import { requireUser } from "@/lib/auth/session";
import { handle, json } from "@/lib/errors";
import { createRoom } from "@/lib/rooms";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser(req);
    const body = CreateRoomBody.parse(await req.json().catch(() => ({})));
    const { room, show, hostKey, links } = await createRoom(body, user);
    return json({ ok: true, code: room.code, showId: show.id, hostKey, links } satisfies CreateRoomRes);
  });
}
