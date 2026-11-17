import type { MeInRoom } from "@/lib/api/contracts";
import { requireUser } from "@/lib/auth/session";
import { handle, json } from "@/lib/errors";
import { buildMe, requireRoom, touchParticipant } from "@/lib/rooms";

export const dynamic = "force-dynamic";

/**
 * My view of the room (vote, which options carry my ideas, mute/ban flags) without the join work: no per-room
 * mutex, no lazy advance, no state build. Players ask for it at VOTE and REVEAL, where every phone used to POST
 * /join at once. A caller who has not joined gets NOT_PARTICIPANT (403) and falls back to /join.
 */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  return handle(async () => {
    const room = await requireRoom((await params).code);
    const user = await requireUser(req);
    const me = await buildMe(room, user.id);
    void touchParticipant(room.id, user.id).catch(() => undefined);
    return json({ ok: true, me } satisfies { ok: true; me: MeInRoom }, { headers: { "Cache-Control": "no-store" } });
  });
}
