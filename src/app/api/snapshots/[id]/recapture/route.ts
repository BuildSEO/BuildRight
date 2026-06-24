import { z } from "zod";
import { db } from "@/lib/db";
import { handle, ok, AppError } from "@/lib/api/handle";

export const runtime = "nodejs";

const recaptureInput = z.object({
  pageIds: z.array(z.string()).min(1),
});

// Re-fetch specific pages: reset them to "queued" and re-queue the snapshot so the worker
// re-captures only those pages (it skips already-done ones). Overwrites their files.
export const POST = handle<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const snapshot = await db.snapshot.findUnique({ where: { id }, select: { id: true } });
  if (!snapshot) throw new AppError("NOT_FOUND", "Snapshot not found", 404);

  const { pageIds } = recaptureInput.parse(await req.json());
  const reset = await db.page.updateMany({
    where: { id: { in: pageIds }, snapshotId: id },
    data: { status: "queued", error: null },
  });
  await db.snapshot.update({ where: { id }, data: { status: "queued", finishedAt: null } });

  return ok({ requeued: reset.count });
});
