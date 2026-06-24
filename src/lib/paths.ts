/**
 * Single source of truth for where generated files live on disk.
 *
 * Layout:
 *   data/
 *     app.db                         # SQLite (Phase 2)
 *     archive/
 *       <projectId>/<snapshotId>/
 *         <pageId>.webp              # screenshot
 *         <pageId>.pdf               # optional PDF
 *         <pageId>.html.gz           # gzipped raw HTML
 *
 * The database stores paths RELATIVE to ARCHIVE_DIR (see toArchiveRelative) so the
 * archive folder is portable and, later, maps cleanly onto object-storage keys.
 */

import { mkdirSync } from "node:fs";
import path from "node:path";

/** Root for all generated, non-committed data (SQLite db + archive). */
export const DATA_DIR = path.join(process.cwd(), "data");

/** Root for captured page assets. */
export const ARCHIVE_DIR = path.join(DATA_DIR, "archive");

function ensureDir(dir: string): string {
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Absolute directory for one snapshot's assets; created if missing. */
export function snapshotDir(projectId: string, snapshotId: string): string {
  return ensureDir(path.join(ARCHIVE_DIR, projectId, snapshotId));
}

/** Asset file extensions stored per captured page. */
export type PageAssetExt = "webp" | "pdf" | "html.gz";

/** Absolute path for one page asset; its parent directory is created if missing. */
export function pageAssetPath(
  projectId: string,
  snapshotId: string,
  pageId: string,
  ext: PageAssetExt,
): string {
  return path.join(snapshotDir(projectId, snapshotId), `${pageId}.${ext}`);
}

/** Convert an absolute archive path to the relative form stored in the DB. */
export function toArchiveRelative(absPath: string): string {
  return path.relative(ARCHIVE_DIR, absPath);
}

/** Resolve a DB-stored relative archive path back to an absolute path. */
export function fromArchiveRelative(relPath: string): string {
  return path.join(ARCHIVE_DIR, relPath);
}

/** Archive directory for a whole project (NOT created — used for deletion). */
export function projectArchiveDir(projectId: string): string {
  return path.join(ARCHIVE_DIR, projectId);
}

/** Archive directory for one snapshot (NOT created — used for deletion). */
export function snapshotArchiveDir(projectId: string, snapshotId: string): string {
  return path.join(ARCHIVE_DIR, projectId, snapshotId);
}
