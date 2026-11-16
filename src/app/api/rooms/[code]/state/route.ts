import type { StateRes } from "@/lib/api/contracts";
import { readSessionUserId } from "@/lib/auth/session";
import { advanceIfDue } from "@/lib/engine/advance";
import { buildPublicState } from "@/lib/engine/publish";
import { handle, json } from "@/lib/errors";
import { requireRoom, touchParticipant } from "@/lib/rooms";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  return handle(async () => {
    const room = await requireRoom((await params).code);
    await advanceIfDue(room.id); // lazy advance: keeps shows moving on hosts without a long-lived ticker
    const state = await buildPublicState(room.id);
    const userId = await readSessionUserId(req);
    if (userId) void touchParticipant(room.id, userId).catch(() => undefined);
    return json({ ok: true, state } satisfies StateRes, { headers: { "Cache-Control": "no-store" } });
  });
}
