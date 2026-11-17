import { VoteBody, type VoteRes } from "@/lib/api/contracts";
import { requireUser } from "@/lib/auth/session";
import { judgeVoted } from "@/lib/bots/runner";
import { handle, json } from "@/lib/errors";
import { log } from "@/lib/log";
import { castVote, requireRoom } from "@/lib/rooms";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  return handle(async () => {
    const room = await requireRoom((await params).code);
    const user = await requireUser(req);
    const body = VoteBody.parse(await req.json().catch(() => ({})));
    const optionId = await castVote(room, user.id, body);
    // Judge Mode: the only human has voted, so the vote closes soon and the bots finish voting (never fails the vote).
    if (room.isDemo && room.demoUserId === user.id) {
      await judgeVoted(room).catch((err) => log.warn({ err, roomCode: room.code }, "demo vote follow-up failed"));
    }
    return json({ ok: true, optionId } satisfies VoteRes);
  });
}
