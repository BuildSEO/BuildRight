import { db } from "@/lib/db";
import { handle, ok, AppError, removeArchiveDir } from "@/lib/api/handle";
import { snapshotArchiveDir } from "@/lib/paths";

export const runtime = "nodejs";

// Progress-polling endpoint: status + counters. Never cached.
export const GET = handle<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  const snapshot = await db.snapshot.findUnique({
    where: { id },
    include: { project: { select: { id: true, name: true, domain: true } } },
  });
  if (!snapshot) throw new AppError("NOT_FOUND", "Snapshot not found", 404);
  return ok(snapshot, { headers: { "cache-control": "no-store" } });
});

// Delete a snapshot: its page rows, the snapshot row, and its archive directory.
export const DELETE = handle<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  const snap = await db.snapshot.findUnique({ where: { id }, select: { id: true, projectId: true } });
  if (!snap) throw new AppError("NOT_FOUND", "Snapshot not found", 404);
  await db.page.deleteMany({ where: { snapshotId: id } });
  await db.snapshot.delete({ where: { id } });
  await removeArchiveDir(snapshotArchiveDir(snap.projectId, id));
  return ok({ deleted: id });
});
