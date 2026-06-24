/**
 * Manual smoke test for compression: capture a URL, then run the screenshot through
 * toWebpUnderLimit + toPdf and report sizes.
 *   npx tsx scripts/test-compress.ts <url>
 * Writes test.webp + test.pdf and prints sizes (confirm WebP < 5 MB and visually clear).
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { capturePage, createCaptureContext } from "@/capture/capture";
import { toWebpUnderLimit, toPdf } from "@/capture/compress";

const mb = (n: number): string => `${(n / 1024 / 1024).toFixed(2)} MB`;

async function main(): Promise<void> {
  const url = process.argv[2];
  if (!url) {
    console.error("usage: tsx scripts/test-compress.ts <url>");
    process.exit(1);
  }

  const browser = await chromium.launch({ args: ["--disable-blink-features=AutomationControlled"] });
  const context = await createCaptureContext(browser);
  try {
    const cap = await capturePage(context, url);
    const webp = await toWebpUnderLimit(cap.pngBuffer);
    const pdf = await toPdf(cap.pngBuffer);

    writeFileSync("test.webp", webp.buffer);
    writeFileSync("test.pdf", pdf);

    console.log(
      JSON.stringify(
        {
          capture: { width: cap.width, height: cap.height, png: mb(cap.pngBuffer.length) },
          webp: {
            width: webp.width,
            height: webp.height,
            quality: webp.quality,
            downscaled: webp.downscaled,
            size: mb(webp.buffer.length),
            underLimit: webp.buffer.length <= 5_000_000,
          },
          pdf: { size: mb(pdf.length) },
        },
        null,
        2,
      ),
    );
    console.log("\nwrote test.webp + test.pdf");
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
