import { db } from "@/lib/db";
import { handle, ok, AppError, parseJsonColumn } from "@/lib/api/handle";

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
    links: parseJsonColumn(page.links),
  });
});
