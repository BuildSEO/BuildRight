import { db } from "@/lib/db";
import { handle, ok, AppError, parseJsonColumn, removeArchiveFileByRelative } from "@/lib/api/handle";

export const runtime = "nodejs";

// Full page detail with headings/schema/links parsed back from their JSON string columns.
export const GET = handle<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  const page = await db.page.findUnique({ where: { id } });
  if (!page) throw new AppError("NOT_FOUND", "Page not found", 404);

  return ok({
    ...page,
    headings: parseJsonColumn(page.headings),
    schema: parseJsonColumn(page.schema),
    seoMeta: parseJsonColumn(page.seoMeta),
    links: parseJsonColumn(page.links),
  });
});

// Delete a single page: its row, its archive files, and recompute the snapshot's counters.
export const DELETE = handle<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  const page = await db.page.findUnique({
    where: { id },
    select: { id: true, snapshotId: true, screenshotPath: true, htmlGzPath: true, pdfPath: true },
  });
  if (!page) throw new AppError("NOT_FOUND", "Page not found", 404);

  for (const rel of [page.screenshotPath, page.htmlGzPath, page.pdfPath]) {
    if (rel) await removeArchiveFileByRelative(rel);
  }
  await db.page.delete({ where: { id } });

  const total = await db.page.count({ where: { snapshotId: page.snapshotId } });
  const done = await db.page.count({
    where: { snapshotId: page.snapshotId, status: { in: ["done", "failed"] } },
  });
  await db.snapshot.updateMany({ where: { id: page.snapshotId }, data: { totalPages: total, donePages: done } });

  return ok({ deleted: id });
});
