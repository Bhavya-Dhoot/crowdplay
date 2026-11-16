import { readSessionUserId } from "@/lib/auth/session";
import { AppError, handle } from "@/lib/errors";
import { assertMockMode, mockBus } from "@/lib/realtime/mock.server";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;
const CHANNEL_RE = /^cp_[A-Z]{5}$/;

/**
 * SSE stand-in for the Nexconn connection (mock mode only). One stream per client carries the room channel
 * and, when a session is present, that user's receipts. The user comes from the session cookie/header,
 * never from the query string.
 */
export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    assertMockMode();
    const channelId = new URL(req.url).searchParams.get("channel") ?? "";
    if (!CHANNEL_RE.test(channelId)) throw new AppError("BAD_REQUEST", "Missing or invalid channel.", 400);
    const userId = await readSessionUserId(req);

    const encoder = new TextEncoder();
    let cleanup = () => {};
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        const write = (chunk: string) => controller.enqueue(encoder.encode(chunk));
        const sub = {
          userId,
          push: (event: string, data: unknown) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          close: () => {
            if (closed) return;
            closed = true;
            clearInterval(heartbeat);
            try {
              controller.close();
            } catch {
              // already closed by the client
            }
          },
        };
        const unsubscribe = mockBus.subscribe(channelId, sub);
        const heartbeat = setInterval(() => {
          try {
            write(": hb\n\n");
          } catch {
            cleanup();
          }
        }, HEARTBEAT_MS);
        cleanup = () => {
          unsubscribe();
          sub.close();
        };
        write("retry: 2000\n: connected\n\n"); // flushes the headers so EventSource fires `open`
        if (req.signal.aborted) cleanup();
        else req.signal.addEventListener("abort", cleanup, { once: true });
      },
      cancel() {
        cleanup();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  });
}
