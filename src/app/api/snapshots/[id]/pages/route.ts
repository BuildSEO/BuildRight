import { db } from "@/lib/db";
import { handle, ok, AppError } from "@/lib/api/handle";
import { pagesQuery } from "@/lib/validation/pages";

export const runtime = "nodejs";

// Captured pages for a snapshot (summary fields), with ?search= and keyset pagination.
export const GET = handle<{ id: string }>(async (req, { params }) => {
  const { id: snapshotId } = await params;
  const snapshot = await db.snapshot.findUnique({ where: { id: snapshotId }, select: { id: true } });
  if (!snapshot) throw new AppError("NOT_FOUND", "Snapshot not found", 404);

  const { search, cursor, take } = pagesQuery.parse(
    Object.fromEntries(new URL(req.url).searchParams),
  );

  const rows = await db.page.findMany({
    where: {
      snapshotId,
      ...(search ? { OR: [{ url: { contains: search } }, { title: { contains: search } }] } : {}),
    },
    orderBy: [{ url: "asc" }, { id: "asc" }],
    take: take + 1, // fetch one extra to detect another page
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      url: true,
      status: true,
      httpStatus: true,
      title: true,
      metaDescription: true,
      h1: true,
      wordCount: true,
      width: true,
      height: true,
      fileSizeBytes: true,
      screenshotPath: true,
      pdfPath: true,
      error: true,
      capturedAt: true,
    },
  });

  const hasMore = rows.length > take;
  const pages = hasMore ? rows.slice(0, take) : rows;
  const nextCursor = hasMore ? (pages[pages.length - 1]?.id ?? null) : null;

  return ok({ pages, nextCursor }, { headers: { "cache-control": "no-store" } });
});
