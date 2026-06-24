import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { capturePage, createCaptureContext } from "@/capture/capture";

const FIXTURE_HTML = `<!doctype html>
<html lang="en">
<head>
  <title>BuildRight Fixture</title>
  <meta name="description" content="A deterministic test page">
  <meta name="robots" content="noindex,follow">
  <link rel="canonical" href="https://example.com/canon">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Acme"}</script>
  <script type="application/ld+json">{ this is not valid json }</script>
</head>
<body>
  <h1>Main Heading</h1>
  <h2>Section A</h2>
  <h2>Section B</h2>
  <h3>Sub</h3>
  <p>one two three four five six</p>
  <a href="/internal-page">internal</a>
  <a href="https://external.example.org/x">external</a>
</body>
</html>`;

let server: Server;
let browser: Browser;
let context: BrowserContext;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((_req, res) => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(FIXTURE_HTML);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address();
  const port = typeof addr === "object" && addr !== null ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}/`;
  browser = await chromium.launch();
  context = await createCaptureContext(browser);
}, 60_000);

afterAll(async () => {
  await context?.close();
  await browser?.close();
  await new Promise<void>((resolve) => server?.close(() => resolve()));
});

describe("capturePage (integration, real Chromium + fixture server)", () => {
  it("extracts SEO fields, a screenshot, dimensions, and html", async () => {
    const r = await capturePage(context, baseUrl);

    expect(r.httpStatus).toBe(200);
    expect(r.extracted.title).toBe("BuildRight Fixture");
    expect(r.extracted.metaDescription).toBe("A deterministic test page");
    expect(r.extracted.metaRobots).toBe("noindex,follow");
    expect(r.extracted.canonical).toBe("https://example.com/canon");
    expect(r.extracted.h1).toBe("Main Heading");
    expect(r.extracted.headings.h2).toEqual(["Section A", "Section B"]);
    expect(r.extracted.headings.h3).toEqual(["Sub"]);

    // Invalid JSON-LD block is skipped; only the valid one survives.
    expect(r.extracted.schema).toHaveLength(1);

    expect(r.extracted.wordCount).toBeGreaterThanOrEqual(6);

    const internal = r.extracted.links.find((l) => l.href.includes("/internal-page"));
    const external = r.extracted.links.find((l) => l.href.includes("external.example.org"));
    expect(internal?.internal).toBe(true);
    expect(external?.internal).toBe(false);

    expect(r.pngBuffer.length).toBeGreaterThan(100);
    expect(r.width).toBeGreaterThan(0);
    expect(r.height).toBeGreaterThan(0);
    expect(r.html).toContain("Main Heading");
  }, 60_000);
});
