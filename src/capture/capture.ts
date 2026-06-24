/**
 * Capture one URL with Playwright: navigate, settle, screenshot full-page, and extract all SEO
 * fields in a single in-page evaluate. Returns plain data — no DB, no disk.
 *
 * The caller passes a SHARED Browser (created once by the worker) and this module creates/closes
 * a fresh context per page so cookies/state never leak between captures.
 */

import type { Browser, BrowserContext, Page } from "playwright";
import { logger } from "@/lib/logger";
import { settings } from "@/lib/settings";

export interface ExtractedSeo {
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  metaRobots: string | null;
  headings: { h1: string[]; h2: string[]; h3: string[]; h4: string[]; h5: string[]; h6: string[] };
  h1: string | null; // first H1, for the table
  schema: unknown[]; // parsed JSON-LD blocks
  links: { href: string; anchor: string; internal: boolean }[];
  wordCount: number;
}

export interface CaptureResult {
  httpStatus: number | null;
  pngBuffer: Buffer;
  width: number;
  height: number;
  html: string;
  extracted: ExtractedSeo;
}

// Tunables come from the central settings file (Phase 12); re-bound here for brevity.
const {
  viewportWidth: VIEWPORT_WIDTH,
  deviceScaleFactor: DEVICE_SCALE_FACTOR,
  navTimeoutMs: NAV_TIMEOUT_MS,
  maxPageHeightPx: MAX_PAGE_HEIGHT_PX,
  userAgent: USER_AGENT,
  cookieOverlaySelectors: COOKIE_OVERLAY_SELECTORS,
} = settings.capture;

// Capture-internal knobs (not user-facing).
const SETTLE_MS = 2_500; // extra wait after the domcontentloaded fallback
const SCROLL_STEP_PX = 800;
const SCROLL_DELAY_MS = 100;
const IMAGE_WAIT_CEILING_MS = 8_000;
const NEUTRALIZE_STICKY = false; // toggle: flatten position:fixed/sticky before the shot

function toMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// Markers of a bot-challenge / "checking your browser" interstitial (Cloudflare et al).
const CHALLENGE_MARKERS =
  "just a moment|checking your browser|checking the site connection|robot challenge|attention required|verify you are human|needs to review the security|cf-browser-verification|ddos protection|enable javascript and cookies to continue";
const CHALLENGE_WAIT_MS = 25_000;

/**
 * Create a configured browser context for a whole snapshot. Sharing ONE context across the
 * snapshot's pages means a bot-challenge clearance cookie (e.g. Cloudflare cf_clearance) is
 * solved once on the first page, not re-challenged on every page.
 */
export async function createCaptureContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    viewport: { width: VIEWPORT_WIDTH, height: 900 },
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    userAgent: USER_AGENT,
    locale: "en-US",
  });
}

/** If the page is a bot-challenge interstitial, wait for it to clear so we capture the real page. */
async function waitForChallengeToClear(page: Page, url: string): Promise<void> {
  let isChallenge = false;
  try {
    isChallenge = await page.evaluate((markers) => {
      const text = `${document.title}\n${document.body ? document.body.innerText : ""}`;
      return new RegExp(markers, "i").test(text);
    }, CHALLENGE_MARKERS);
  } catch {
    return;
  }
  if (!isChallenge) return;

  logger.warn("capture: bot-challenge detected — waiting for it to clear", { url });
  try {
    await page.waitForFunction(
      (markers) => {
        const text = `${document.title}\n${document.body ? document.body.innerText : ""}`;
        return !new RegExp(markers, "i").test(text);
      },
      CHALLENGE_MARKERS,
      { timeout: CHALLENGE_WAIT_MS, polling: 1000 },
    );
    await page.waitForLoadState("domcontentloaded").catch(() => undefined);
    await page.waitForTimeout(1500); // let the real page paint after the challenge clears
    logger.info("capture: challenge cleared", { url });
  } catch {
    logger.warn("capture: challenge did not clear within timeout — capturing as-is", { url });
  }
}

export async function capturePage(context: BrowserContext, url: string): Promise<CaptureResult> {
  const page = await context.newPage();

  try {

    // tsx/esbuild "keepNames" wraps transpiled functions with a __name() helper; Playwright
    // serializes our evaluate functions into the page, where __name is undefined. Define a
    // no-op in the page (as a string, so this init script itself isn't transformed) so that
    // page.evaluate works under tsx (the worker) as well as under tsc/vitest.
    await page.addInitScript({
      content: "globalThis.__name = globalThis.__name || (function (fn) { return fn; });",
    });

    // 2. Navigate. Prefer networkidle; fall back to domcontentloaded + a settle delay.
    let httpStatus: number | null = null;
    try {
      const resp = await page.goto(url, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
      httpStatus = resp?.status() ?? null;
    } catch (navErr) {
      logger.warn("capture: networkidle timed out — falling back to domcontentloaded", {
        url,
        error: toMessage(navErr),
      });
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
      httpStatus = resp?.status() ?? null;
      await page.waitForTimeout(SETTLE_MS);
    }

    // 2b. Wait out a bot-challenge interstitial (e.g. Cloudflare) so we capture the real page.
    await waitForChallengeToClear(page, url);

    // 3. Hide cookie overlays, unlock scroll, freeze animations, and reveal scroll-animated content
    //    so nothing is captured mid-transition or stuck at opacity:0.
    await page.addStyleTag({
      content:
        `${COOKIE_OVERLAY_SELECTORS.join(",")} { display: none !important; }\n` +
        `html, body { overflow: auto !important; }\n` +
        `*, *::before, *::after { animation-duration: 0.001s !important; animation-delay: 0s !important; transition: none !important; }\n` +
        `[data-aos], .aos-init, .wow, .reveal, .scroll-reveal, .animate-in, .has-reveal, [data-animate] { opacity: 1 !important; transform: none !important; visibility: visible !important; }`,
    });

    // 3b. Force lazy images to load (native loading=lazy + common data-src/data-srcset patterns).
    await page.evaluate(() => {
      for (const img of Array.from(document.querySelectorAll("img"))) {
        img.loading = "eager";
        const dataSrc = img.getAttribute("data-src");
        if (dataSrc && !img.getAttribute("src")) img.setAttribute("src", dataSrc);
        const dataSrcset = img.getAttribute("data-srcset");
        if (dataSrcset && !img.getAttribute("srcset")) img.setAttribute("srcset", dataSrcset);
      }
    });

    // 4. Trigger lazy-loading by scrolling top→bottom in steps, capped at MAX_PAGE_HEIGHT_PX.
    const capped = await page.evaluate(
      async ({ step, delay, maxHeight }: { step: number; delay: number; maxHeight: number }) => {
        const sleep = (ms: number) => new Promise<void>((res) => setTimeout(() => res(), ms));
        let y = 0;
        let lastHeight = 0;
        let stable = 0;
        let hitCap = false;
        for (let i = 0; i < 2000; i++) {
          const sh = document.documentElement.scrollHeight;
          if (y >= maxHeight) {
            hitCap = true;
            break;
          }
          if (y >= sh) {
            if (sh === lastHeight) {
              stable += 1;
              if (stable >= 2) break;
            } else {
              stable = 0;
            }
          }
          lastHeight = sh;
          window.scrollTo(0, y);
          y += step;
          await sleep(delay);
        }
        window.scrollTo(0, 0);
        return hitCap;
      },
      { step: SCROLL_STEP_PX, delay: SCROLL_DELAY_MS, maxHeight: MAX_PAGE_HEIGHT_PX },
    );
    if (capped) {
      logger.warn("capture: page-height cap hit — capture clipped", { url, maxHeight: MAX_PAGE_HEIGHT_PX });
    }

    // 4b. Let images/backgrounds requested during the scroll actually finish downloading.
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);

    // 5. Wait for fonts + images (bounded), so the shot isn't missing glyphs/images.
    try {
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      await page.evaluate(async (ceiling: number) => {
        const imgs = Array.from(document.querySelectorAll("img"));
        const pending = imgs
          .filter((img) => !img.complete)
          .map(
            (img) =>
              new Promise<void>((res) => {
                img.addEventListener("load", () => res(), { once: true });
                img.addEventListener("error", () => res(), { once: true });
              }),
          );
        await Promise.race([
          Promise.all(pending),
          new Promise<void>((res) => setTimeout(() => res(), ceiling)),
        ]);
      }, IMAGE_WAIT_CEILING_MS);
    } catch (e) {
      logger.warn("capture: font/image wait failed (continuing)", { url, error: toMessage(e) });
    }

    // 6. Optionally flatten sticky/fixed elements so they don't repeat down a full-page shot.
    if (NEUTRALIZE_STICKY) {
      await page.evaluate(() => {
        for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
          const pos = getComputedStyle(el).position;
          if (pos === "fixed" || pos === "sticky") el.style.position = "static";
        }
      });
    }

    // 7. Full-page screenshot + page dimensions.
    const pngBuffer = await page.screenshot({ fullPage: true, type: "png" });
    const { width, height } = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }));

    // 8. Extract all SEO fields in ONE in-page evaluate.
    const extracted = await page.evaluate((): ExtractedSeo => {
      const attrOf = (sel: string, attr: string): string | null => {
        const v = document.querySelector(sel)?.getAttribute(attr)?.trim();
        return v ? v : null;
      };
      const tags = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;
      const headings: ExtractedSeo["headings"] = { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] };
      for (const tag of tags) {
        headings[tag] = Array.from(document.querySelectorAll(tag))
          .map((h) => (h.textContent ?? "").trim())
          .filter((t) => t.length > 0);
      }
      const schema: unknown[] = [];
      for (const s of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
        try {
          schema.push(JSON.parse(s.textContent ?? ""));
        } catch {
          /* skip invalid JSON-LD block */
        }
      }
      const host = location.host;
      const links = Array.from(document.querySelectorAll("a[href]")).map((a) => {
        const el = a as HTMLAnchorElement;
        const href = el.href; // resolved absolute
        let internal = false;
        try {
          internal = new URL(href).host === host;
        } catch {
          internal = false;
        }
        return { href, anchor: (el.textContent ?? "").trim(), internal };
      });
      const bodyText = document.body?.innerText ?? "";
      const wordCount = bodyText.split(/\s+/).filter((w) => w.length > 0).length;

      const title = document.title.trim();
      return {
        title: title.length > 0 ? title : null,
        metaDescription: attrOf('meta[name="description"]', "content"),
        canonical: attrOf('link[rel="canonical"]', "href"),
        metaRobots: attrOf('meta[name="robots"]', "content"),
        h1: headings.h1[0] ?? null,
        headings,
        schema,
        links,
        wordCount,
      };
    });

    // 9. Raw HTML.
    const html = await page.content();

    return { httpStatus, pngBuffer, width, height, html, extracted };
  } catch (e) {
    throw new Error(`capturePage failed for ${url}: ${toMessage(e)}`);
  } finally {
    // 10. Always close the page; the context is shared across the snapshot's captures.
    await page.close();
  }
}
