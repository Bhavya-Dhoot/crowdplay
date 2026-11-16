import pino from "pino";

const g = globalThis as unknown as { __cpLog?: pino.Logger };

// Structured logs. Add { roomCode, roundNo, phase } via log.child(...) at call sites.
export const log: pino.Logger =
  g.__cpLog ??
  (g.__cpLog = pino({
    level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
    base: { app: "crowdplay" },
  }));
