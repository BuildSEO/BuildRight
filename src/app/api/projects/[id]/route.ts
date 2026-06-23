import { db } from "@/lib/db";
import { handle, ok, AppError } from "@/lib/api/handle";

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
