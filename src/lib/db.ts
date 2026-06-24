/**
 * Single shared PrismaClient.
 *
 * In Next.js dev, hot-reload re-imports modules on every change; a naive
 * `new PrismaClient()` at module scope would open a new connection pool per
 * reload and exhaust handles. The globalThis cache keeps exactly one client.
 * Imported by both the API and the worker.
 */

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; walEnabled?: boolean };
// ^ cast required: globalThis has no `prisma` field in its type. Localized per Phase 0.

export const db = globalForPrisma.prisma ?? new PrismaClient();

// Don't pin to globalThis in production — the process starts once, so a fresh
// client per process is correct and avoids leaking a long-lived global.
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

// Enable SQLite WAL for concurrent app + worker access. Idempotent + persisted in the db file.
if (!globalForPrisma.walEnabled) {
  globalForPrisma.walEnabled = true;
  void db.$queryRawUnsafe("PRAGMA journal_mode=WAL;").catch(() => undefined);
}
