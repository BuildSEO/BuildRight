/**
 * Manual smoke test for URL discovery.
 *   npx tsx scripts/test-discover.ts <domain> [sitemap|crawl] [maxPages]
 * e.g.
 *   npx tsx scripts/test-discover.ts https://example.com
 *   npx tsx scripts/test-discover.ts https://www.prisma.io sitemap 15
 */
import { discoverUrls } from "@/capture/discover";

async function main(): Promise<void> {
  const domain = process.argv[2];
  if (!domain) {
    console.error("usage: tsx scripts/test-discover.ts <domain> [sitemap|crawl] [maxPages]");
    process.exit(1);
  }
  const mode = process.argv[3] === "crawl" ? "crawl" : "sitemap";
  const maxPages = Number(process.argv[4] ?? "50");

  const started = Date.now();
  const urls = await discoverUrls(domain, { mode, maxPages });
  const ms = Date.now() - started;

  for (const u of urls) console.log(u);
  console.log(`\n${urls.length} URLs  (mode=${mode}, cap=${maxPages}, ${ms}ms)`);
}

main().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
