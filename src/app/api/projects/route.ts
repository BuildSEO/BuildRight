import { db } from "@/lib/db";
import { handle, ok } from "@/lib/api/handle";
import { createProjectInput, listProjectsQuery } from "@/lib/validation/projects";

export const runtime = "nodejs";

export const GET = handle(async (req) => {
  const { q } = listProjectsQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
  const where = q
    ? { OR: [{ name: { contains: q } }, { domain: { contains: q } }] }
    : {};
  const projects = await db.project.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { snapshots: true } },
      snapshots: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
  });
  return ok(
    projects.map((p) => ({
      id: p.id,
      name: p.name,
      domain: p.domain,
      createdAt: p.createdAt,
      snapshotCount: p._count.snapshots,
      lastSnapshotAt: p.snapshots[0]?.createdAt ?? null,
    })),
  );
});

export const POST = handle(async (req) => {
  const body = createProjectInput.parse(await req.json());
  const project = await db.project.create({ data: body });
  return ok(project, { status: 201 });
});
