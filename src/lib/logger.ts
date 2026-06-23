/**
 * Tiny structured logger. Every line is a single JSON object:
 *   { ts, level, message, meta? }
 *
 * Phase 0 rule: worker and capture code log through this, never `console.log`.
 * `info` goes to stdout; `warn`/`error` go to stderr.
 */

type Level = "info" | "warn" | "error";

function emit(level: Level, message: string, meta?: Record<string, unknown>): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...(meta ? { meta } : {}),
  });
  const stream = level === "info" ? process.stdout : process.stderr;
  stream.write(line + "\n");
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>): void => emit("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>): void => emit("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>): void => emit("error", message, meta),
};
