import { db } from "@/lib/db";
import { handle, ok, AppError, removeArchiveDir } from "@/lib/api/handle";
import { projectArchiveDir } from "@/lib/paths";

export const runtime = "nodejs";

// Project detail + its snapshots (newest first), for the project page.
export const GET = handle<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  const project = await db.project.findUnique({
    where: { id },
    include: {
      snapshots: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          label: true,
          status: true,
          discovery: true,
          maxPages: true,
          totalPages: true,
          donePages: true,
          createdAt: true,
          finishedAt: true,
        },
      },
    },
  });
  if (!project) throw new AppError("NOT_FOUND", "Project not found", 404);
  return ok(project);
});

// Delete a project: all its snapshots' pages, snapshots, the project, and its archive directory.
export const DELETE = handle<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  const project = await db.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) throw new AppError("NOT_FOUND", "Project not found", 404);
  const snaps = await db.snapshot.findMany({ where: { projectId: id }, select: { id: true } });
  for (const s of snaps) await db.page.deleteMany({ where: { snapshotId: s.id } });
  await db.snapshot.deleteMany({ where: { projectId: id } });
  await db.project.delete({ where: { id } });
  await removeArchiveDir(projectArchiveDir(id));
  return ok({ deleted: id });
});
