import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { TTS_ID_RE, ttsFile } from "@/lib/ai/tts";
import { AppError, handle } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const notFound = () => new AppError("NOT_FOUND", "That audio clip is not available.", 404);

/** Serves narrator audio written by ai/tts.ts. Clip ids are content hashes, so they never change. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return handle(async () => {
    const { id } = await params;
    if (!TTS_ID_RE.test(id)) throw notFound();
    const file = ttsFile(id);
    const size = await stat(file)
      .then((s) => (s.isFile() ? s.size : -1))
      .catch(() => -1);
    if (size < 0) throw notFound();

    const headers = {
      "Content-Type": "audio/mpeg",
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=31536000, immutable",
    };
    // Safari only plays <audio> from servers that honour Range requests.
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start > end || start >= size) {
        return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
      }
      return new Response(Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream, {
        status: 206,
        headers: { ...headers, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${size}` },
      });
    }
    return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
      headers: { ...headers, "Content-Length": String(size) },
    });
  });
}
