import { handle } from "@/lib/errors";
import { handleWebhook } from "@/lib/ingest/webhook";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  return handle(() => handleWebhook(req));
}
