import { ZodError } from "zod";
import { log } from "./log";

/** Typed application error. `code` is stable and maps to copy in src/lib/copy.ts on the client. */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export type ApiError = { ok: false; code: string; message: string };

/** Wrap a route handler body: AppError -> JSON error, ZodError -> 400, anything else -> 500. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AppError) {
      return Response.json({ ok: false, code: err.code, message: err.message } satisfies ApiError, {
        status: err.status,
      });
    }
    if (err instanceof ZodError) {
      return Response.json(
        { ok: false, code: "BAD_REQUEST", message: err.issues[0]?.message ?? "Invalid request" } satisfies ApiError,
        { status: 400 },
      );
    }
    log.error({ err }, "unhandled route error");
    return Response.json(
      { ok: false, code: "INTERNAL", message: "Something went wrong. Please try again." } satisfies ApiError,
      { status: 500 },
    );
  }
}

export function json<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data, init);
}
