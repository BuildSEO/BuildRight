/**
 * Manual smoke test for page capture.
 *   npx tsx scripts/test-capture.ts <url>
 * e.g.
 *   npx tsx scripts/test-capture.ts https://stripe.com
 *
 * Launches Chromium, captures the URL, writes the screenshot to test.png, and prints the
 * extracted SEO JSON (without the raw html / png bytes).
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { capturePage, createCaptureContext } from "@/capture/capture";

async function main(): Promise<void> {
  const url = process.argv[2];
  if (!url) {
    console.error("usage: tsx scripts/test-capture.ts <url>");
    process.exit(1);
  }

  const browser = await chromium.launch({ args: ["--disable-blink-features=AutomationControlled"] });
  const context = await createCaptureContext(browser);
  try {
    const started = Date.now();
    const result = await capturePage(context, url);
    const ms = Date.now() - started;

    writeFileSync("test.png", result.pngBuffer);

    const { pngBuffer, html, extracted, ...meta } = result;
    console.log(
      JSON.stringify(
        {
          ...meta,
          pngBytes: pngBuffer.length,
          htmlChars: html.length,
          extracted: {
            ...extracted,
            schema: `${extracted.schema.length} block(s)`,
            links: `${extracted.links.length} link(s) (${extracted.links.filter((l) => l.internal).length} internal)`,
          },
        },
        null,
        2,
      ),
    );
    console.log(`\nwrote test.png  (${ms}ms)`);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
