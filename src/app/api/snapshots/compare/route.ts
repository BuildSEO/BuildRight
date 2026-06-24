import { z } from "zod";
import { db } from "@/lib/db";
import { handle, ok, AppError, parseJsonColumn } from "@/lib/api/handle";
import {
  compareSnapshots,
  internalLinksFrom,
  schemaTypesFrom,
  type ComparePage,
} from "@/lib/compare";

export const runtime = "nodejs";

const compareQuery = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

async function loadComparePages(snapshotId: string): Promise<ComparePage[]> {
  const rows = await db.page.findMany({
    where: { snapshotId },
    select: {
      url: true,
      httpStatus: true,
      title: true,
      h1: true,
      metaRobots: true,
      canonical: true,
      links: true,
      schema: true,
    },
  });
  return rows.map((r) => ({
    url: r.url,
    httpStatus: r.httpStatus,
    title: r.title,
    h1: r.h1,
    metaRobots: r.metaRobots,
    canonical: r.canonical,
    internalLinks: internalLinksFrom(parseJsonColumn(r.links)),
    schemaTypes: schemaTypesFrom(parseJsonColumn(r.schema)),
  }));
}

// Compare two snapshots of the same project, by URL.
export const GET = handle(async (req) => {
  const { from, to } = compareQuery.parse(Object.fromEntries(new URL(req.url).searchParams));

  const [a, b] = await Promise.all([
    db.snapshot.findUnique({ where: { id: from }, select: { id: true, projectId: true } }),
    db.snapshot.findUnique({ where: { id: to }, select: { id: true, projectId: true } }),
  ]);
  if (!a || !b) throw new AppError("NOT_FOUND", "Snapshot not found", 404);
  if (a.projectId !== b.projectId) {
    throw new AppError("BAD_REQUEST", "Snapshots belong to different projects", 400);
  }

  const [fromPages, toPages] = await Promise.all([loadComparePages(from), loadComparePages(to)]);
  return ok(compareSnapshots(fromPages, toPages));
});
