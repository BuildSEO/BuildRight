/**
 * Seed a queued Snapshot for the worker to pick up (mirrors the Phase 2 manual flow).
 *   npx tsx --env-file=.env scripts/seed-snapshot.ts <domain> [maxPages] [sitemap|crawl]
 * Then run:  npm run worker
 */
import { db } from "@/lib/db";

async function main(): Promise<void> {
  const domain = process.argv[2];
  if (!domain) {
    console.error("usage: tsx --env-file=.env scripts/seed-snapshot.ts <domain> [maxPages] [sitemap|crawl]");
    process.exit(1);
  }
  const maxPages = Number(process.argv[3] ?? "10");
  const discovery = process.argv[4] === "crawl" ? "crawl" : "sitemap";
  const withScheme = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
  const name = new URL(withScheme).hostname;

  const project = await db.project.create({ data: { name, domain } });
  const snapshot = await db.snapshot.create({
    data: { projectId: project.id, discovery, maxPages, label: "seed" },
  });

  console.log(JSON.stringify({ projectId: project.id, snapshotId: snapshot.id, domain, maxPages, discovery }, null, 2));
  console.log("\nQueued. Now run:  npm run worker");
  await db.$disconnect();
}

main().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
