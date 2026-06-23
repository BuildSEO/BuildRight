/**
 * Shared API plumbing: a consistent success/error envelope, a handler wrapper that turns
 * thrown errors into the right HTTP response, and a traversal-guarded archive file server.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { ZodError } from "zod";
import { logger } from "@/lib/logger";
import { ARCHIVE_DIR, fromArchiveRelative } from "@/lib/paths";

export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function ok<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ ok: true, data }, { status: 200, ...init });
}

export function fail(code: string, message: string, status: number, details?: unknown): Response {
  return Response.json(
    { ok: false, error: { code, message, ...(details !== undefined ? { details } : {}) } },
    { status },
  );
}

export interface RouteContext<P> {
  params: Promise<P>;
}

/** Wrap a route handler: ZodError → 400, AppError → its status, anything else → 500 (logged). */
export function handle<P = Record<string, never>>(
  fn: (req: Request, ctx: RouteContext<P>) => Promise<Response>,
): (req: Request, ctx: RouteContext<P>) => Promise<Response> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof ZodError) return fail("VALIDATION_ERROR", "Invalid input", 400, e.flatten());
      if (e instanceof AppError) return fail(e.code, e.message, e.status);
      logger.error("api: unhandled error", { error: e instanceof Error ? e.message : String(e) });
      return fail("INTERNAL", "Something went wrong", 500);
    }
  };
}

/** Parse a JSON-in-string DB column, returning null on absence or malformed JSON. */
export function parseJsonColumn(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Serve a file from the archive by its DB-stored RELATIVE path. The path comes from the DB
 * (never the client), but we still resolve it strictly inside ARCHIVE_DIR as defense in depth.
 */
export async function serveArchiveFile(relPath: string, contentType: string): Promise<Response> {
  const abs = path.resolve(fromArchiveRelative(relPath));
  const root = path.resolve(ARCHIVE_DIR) + path.sep;
  if (!abs.startsWith(root)) throw new AppError("FORBIDDEN", "Invalid asset path", 403);

  let data: Buffer;
  try {
    data = await readFile(abs);
  } catch {
    throw new AppError("NOT_FOUND", "Asset file missing", 404);
  }
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": contentType,
      "content-length": String(data.length),
      "cache-control": "private, max-age=86400, immutable",
    },
  });
}
