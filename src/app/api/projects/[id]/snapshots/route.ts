import { db } from "@/lib/db";
import { handle, ok, AppError } from "@/lib/api/handle";
import { createSnapshotInput } from "@/lib/validation/snapshots";

export const runtime = "nodejs";

// Create a queued snapshot for a project. Writes the row only — the worker does the capture.
export const POST = handle<{ id: string }>(async (req, { params }) => {
  const { id: projectId } = await params;
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) throw new AppError("NOT_FOUND", "Project not found", 404);

  const body = createSnapshotInput.parse(await req.json().catch(() => ({})));
  const snapshot = await db.snapshot.create({ data: { projectId, ...body } });
  return ok(snapshot, { status: 201 });
});
