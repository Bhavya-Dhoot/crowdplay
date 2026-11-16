import { VoteBody, type VoteRes } from "@/lib/api/contracts";
import { requireUser } from "@/lib/auth/session";
import { handle, json } from "@/lib/errors";
import { castVote, requireRoom } from "@/lib/rooms";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  return handle(async () => {
    const room = await requireRoom((await params).code);
    const user = await requireUser(req);
    const body = VoteBody.parse(await req.json().catch(() => ({})));
    const optionId = await castVote(room, user.id, body);
    return json({ ok: true, optionId } satisfies VoteRes);
  });
}
