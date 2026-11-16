import { JoinBody, type JoinRes } from "@/lib/api/contracts";
import { requireUser } from "@/lib/auth/session";
import { advanceIfDue } from "@/lib/engine/advance";
import { buildPublicState, markStatsDirty } from "@/lib/engine/publish";
import { handle, json } from "@/lib/errors";
import { buildMe, joinRoom, requireRoom } from "@/lib/rooms";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  return handle(async () => {
    const room = await requireRoom((await params).code);
    const user = await requireUser(req);
    const body = JoinBody.parse(await req.json().catch(() => ({})));
    const { isNew } = await joinRoom(room, user, body.lang);
    await advanceIfDue(room.id);
    const [state, me] = await Promise.all([buildPublicState(room.id), buildMe(room, user.id)]);
    if (isNew) markStatsDirty(room.id);
    return json({ ok: true, state, me, channelId: room.channelId } satisfies JoinRes);
  });
}
