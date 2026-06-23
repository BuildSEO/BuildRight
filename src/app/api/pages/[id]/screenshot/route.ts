import { db } from "@/lib/db";
import { handle, AppError, serveArchiveFile } from "@/lib/api/handle";

export const runtime = "nodejs";

// Stream the .webp screenshot. Path is read from the DB by id — never taken from the client.
export const GET = handle<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  const page = await db.page.findUnique({ where: { id }, select: { screenshotPath: true } });
  if (!page?.screenshotPath) throw new AppError("NOT_FOUND", "Screenshot not found", 404);
  return serveArchiveFile(page.screenshotPath, "image/webp");
});
