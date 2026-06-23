import { db } from "@/lib/db";
import { handle, AppError, serveArchiveFile } from "@/lib/api/handle";

export const runtime = "nodejs";

// Stream the .pdf if one was generated for this page.
export const GET = handle<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  const page = await db.page.findUnique({ where: { id }, select: { pdfPath: true } });
  if (!page?.pdfPath) throw new AppError("NOT_FOUND", "PDF not found", 404);
  return serveArchiveFile(page.pdfPath, "application/pdf");
});
