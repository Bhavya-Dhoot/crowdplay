// GET /api/admin/export?token=...: every show as CSV (demo rooms included, labelled "demo"). Needs ADMIN_TOKEN.
import { AppError, handle } from "@/lib/errors";
import { adminAccess, adminCsv } from "@/lib/metrics";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" };

export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const access = adminAccess(new URL(req.url).searchParams.get("token"));
    if (access === "disabled") {
      throw new AppError("ADMIN_DISABLED", "Admin is switched off. Set ADMIN_TOKEN on the server to turn it on.", 403);
    }
    if (access === "denied") {
      throw new AppError("ADMIN_FORBIDDEN", "That admin token isn't right. Check the link and try again.", 403);
    }
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(await adminCsv(), {
      headers: {
        ...NO_STORE,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="crowdplay-sessions-${stamp}.csv"`,
      },
    });
  });
}
