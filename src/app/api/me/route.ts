import { desc, eq, ne, and, sql } from "drizzle-orm";
import type { MeReceipt, MeRes } from "@/lib/api/contracts";
import { requireUser } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db/client";
import { handle } from "@/lib/errors";

export const dynamic = "force-dynamic";

const RECEIPT_LIMIT = 200;

export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser(req);
    const db = await getDb();

    const rows = await db
      .select({
        id: schema.receipts.id,
        type: schema.receipts.type,
        showId: schema.receipts.showId,
        showTitle: schema.rooms.title,
        roundNo: schema.rounds.roundNo,
        optionLabel: schema.options.label,
        ideaText: schema.ideas.text,
        createdAt: schema.receipts.createdAt,
      })
      .from(schema.receipts)
      .innerJoin(schema.rounds, eq(schema.rounds.id, schema.receipts.roundId))
      .innerJoin(schema.shows, eq(schema.shows.id, schema.receipts.showId))
      .innerJoin(schema.rooms, eq(schema.rooms.id, schema.shows.roomId))
      .innerJoin(schema.options, eq(schema.options.id, schema.receipts.optionId))
      .innerJoin(schema.ideas, eq(schema.ideas.id, schema.receipts.ideaId))
      .where(eq(schema.receipts.userId, user.id))
      .orderBy(desc(schema.receipts.createdAt))
      .limit(RECEIPT_LIMIT);

    const receipts: MeReceipt[] = rows.map((r) => ({
      id: r.id,
      type: r.type === "CANON" ? "CANON" : "BALLOT",
      showId: r.showId,
      showTitle: r.showTitle,
      roundNo: r.roundNo,
      optionLabel: r.optionLabel,
      ideaText: r.ideaText,
      createdAt: r.createdAt.getTime(),
    }));

    const byType = await db
      .select({ type: schema.receipts.type, n: sql<number>`count(*)::int` })
      .from(schema.receipts)
      .where(eq(schema.receipts.userId, user.id))
      .groupBy(schema.receipts.type);
    const [ideaCount] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.ideas)
      .where(and(eq(schema.ideas.userId, user.id), eq(schema.ideas.status, "ok")));

    // "Shows" = distinct shows this person took part in: sent an idea, cast a vote or earned a receipt.
    const shows = new Set<string>();
    const viaIdeas = await db
      .selectDistinct({ showId: schema.rounds.showId })
      .from(schema.ideas)
      .innerJoin(schema.rounds, eq(schema.rounds.id, schema.ideas.roundId))
      .where(and(eq(schema.ideas.userId, user.id), ne(schema.ideas.status, "deleted")));
    const viaVotes = await db
      .selectDistinct({ showId: schema.rounds.showId })
      .from(schema.votes)
      .innerJoin(schema.rounds, eq(schema.rounds.id, schema.votes.roundId))
      .where(eq(schema.votes.userId, user.id));
    const viaReceipts = await db
      .selectDistinct({ showId: schema.receipts.showId })
      .from(schema.receipts)
      .where(eq(schema.receipts.userId, user.id));
    for (const r of [...viaIdeas, ...viaVotes, ...viaReceipts]) shows.add(r.showId);

    const res: MeRes = {
      ok: true,
      user: { id: user.id, displayName: user.displayName },
      receipts,
      stats: {
        ideas: ideaCount?.n ?? 0,
        ballots: byType.find((t) => t.type === "BALLOT")?.n ?? 0,
        canon: byType.find((t) => t.type === "CANON")?.n ?? 0,
        shows: shows.size,
      },
    };
    return Response.json(res, { headers: { "Cache-Control": "no-store" } });
  });
}
