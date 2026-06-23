/**
 * In-process end-to-end test of the worker's runSnapshot (no polling loop / no signals):
 * seed a project + snapshot, run it to completion against a real Chromium, print the result,
 * verify the archive files exist, then clean up the test rows.
 *   npx tsx --env-file=.env scripts/test-worker.ts [domain] [maxPages] [sitemap|crawl]
 */
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { db } from "@/lib/db";
import { fromArchiveRelative } from "@/lib/paths";

async function main(): Promise<void> {
  const domain = process.argv[2] ?? "https://example.com";
  const maxPages = Number(process.argv[3] ?? "3");
  const discovery = process.argv[4] === "sitemap" ? "sitemap" : "crawl";

  // Import the worker only after disabling its auto-start loop.
  process.env.WORKER_NO_MAIN = "1";
  const { runSnapshot } = await import("@/worker/index");

  const project = await db.project.create({ data: { name: "test-worker", domain } });
  const created = await db.snapshot.create({
    data: { projectId: project.id, discovery, maxPages, label: "test-worker" },
  });
  const snapshot = await db.snapshot.findUnique({ where: { id: created.id }, include: { project: true } });
  if (!snapshot) throw new Error("seed failed");

  const browser = await chromium.launch();
  try {
    await runSnapshot(snapshot, browser);
  } finally {
    await browser.close();
  }

  const final = await db.snapshot.findUnique({ where: { id: created.id } });
  const pages = await db.page.findMany({ where: { snapshotId: created.id } });

  console.log(
    JSON.stringify(
      {
        snapshot: {
          status: final?.status,
          totalPages: final?.totalPages,
          donePages: final?.donePages,
          error: final?.error,
        },
        pages: pages.map((p) => ({
          url: p.url,
          status: p.status,
          httpStatus: p.httpStatus,
          title: p.title,
          bytes: p.fileSizeBytes,
          screenshotExists: p.screenshotPath ? existsSync(fromArchiveRelative(p.screenshotPath)) : false,
          htmlExists: p.htmlGzPath ? existsSync(fromArchiveRelative(p.htmlGzPath)) : false,
        })),
      },
      null,
      2,
    ),
  );

  // Clean up the test rows (archive files under data/ are gitignored; left for inspection).
  await db.page.deleteMany({ where: { snapshotId: created.id } });
  await db.snapshot.delete({ where: { id: created.id } });
  await db.project.delete({ where: { id: project.id } });
  await db.$disconnect();
  console.log("\n(cleaned up test rows)");
}

main().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
