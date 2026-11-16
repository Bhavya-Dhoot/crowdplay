import { IdeaBody, type IdeaRejectCode, type IdeaRes } from "@/lib/api/contracts";
import { requireUser } from "@/lib/auth/session";
import { handle, AppError } from "@/lib/errors";
import { normalizeRoomCode } from "@/lib/ids";
import { ingestIdea } from "@/lib/ingest/ideas";

export const dynamic = "force-dynamic";

const STATUS: Record<IdeaRejectCode, number> = {
  EMPTY: 400,
  TOO_LONG: 400,
  BLOCKED: 422,
  NOT_STORM: 409,
  WRONG_ROUND: 409,
  RATE_LIMITED: 429,
  ROUND_CAP: 429,
  MUTED: 403,
  BANNED: 403,
  NOT_PARTICIPANT: 403,
};

function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || null;
}

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  return handle(async () => {
    const user = await requireUser(req);
    const code = normalizeRoomCode((await params).code);
    if (!code) throw new AppError("ROOM_NOT_FOUND", "We couldn't find that room.", 404);
    const body = IdeaBody.parse(await req.json().catch(() => null));

    const res: IdeaRes = await ingestIdea({
      roomCode: code,
      userId: user.id,
      roundNo: body.roundNo,
      text: body.text,
      clientMsgId: body.clientMsgId,
      source: "post",
      ip: clientIp(req),
    });
    if (res.ok) return Response.json(res);
    const headers: Record<string, string> = {};
    if (res.retryInMs !== undefined) headers["Retry-After"] = String(Math.max(1, Math.ceil(res.retryInMs / 1000)));
    return Response.json(res, { status: STATUS[res.code], headers });
  });
}
