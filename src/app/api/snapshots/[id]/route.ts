import { db } from "@/lib/db";
import { handle, ok, AppError } from "@/lib/api/handle";

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
