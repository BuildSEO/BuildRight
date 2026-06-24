import { db } from "@/lib/db";
import { handle, ok, AppError } from "@/lib/api/handle";

export const runtime = "nodejs";

const RUNNING = ["queued", "discovering", "capturing"];

// Stop a running snapshot. Sets status="stopped"; the worker notices and halts between pages.
export const POST = handle<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  const snap = await db.snapshot.findUnique({ where: { id }, select: { status: true } });
  if (!snap) throw new AppError("NOT_FOUND", "Snapshot not found", 404);
  if (!RUNNING.includes(snap.status)) {
    throw new AppError("CONFLICT", "Snapshot is not running", 409);
  }
  const updated = await db.snapshot.update({
    where: { id },
    data: { status: "stopped", finishedAt: new Date() },
  });
  return ok(updated);
});
