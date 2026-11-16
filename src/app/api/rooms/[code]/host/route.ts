import { HostAction, type HostRes } from "@/lib/api/contracts";
import { requireHostKey } from "@/lib/auth/hostKey";
import { handle, json } from "@/lib/errors";
import { applyHostAction, requireRoom } from "@/lib/rooms";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  return handle(async () => {
    const room = await requireRoom((await params).code);
    requireHostKey(req, room);
    const action = HostAction.parse(await req.json().catch(() => ({})));
    const state = await applyHostAction(room, action);
    return json({ ok: true, state } satisfies HostRes);
  });
}
