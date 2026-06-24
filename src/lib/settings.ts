/**
 * Central tunables for capture + worker (Phase 12). A few are overridable via env so the tool
 * can be tuned per machine without code changes. This is the one module that reads process.env.
 */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === "1" || raw.toLowerCase() === "true";
}

export const settings = {
  capture: {
    concurrency: envInt("CAPTURE_CONCURRENCY", 4), // 3–4 is the local sweet spot
    headless: envBool("CAPTURE_HEADLESS", true), // set CAPTURE_HEADLESS=false for stubborn bot-challenges
    viewportWidth: 1440,
    deviceScaleFactor: 1.5,
    navTimeoutMs: 30_000,
    perPageTimeoutMs: 90_000,
    maxPageHeightPx: 25_000, // lazy-load scroll cap (clips infinite-scroll pages)
    webpMaxBytes: 5_000_000, // 5 MB screenshot budget
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/126.0.0.0 Safari/537.36 BuildRight-SEO-Snapshot/0.1",
    // Common cookie/consent/GDPR containers, hidden (not clicked) before the screenshot.
    cookieOverlaySelectors: [
      "#onetrust-banner-sdk",
      "#onetrust-consent-sdk",
      "#CybotCookiebotDialog",
      "#hs-eu-cookie-confirmation",
      ".cc-window",
      ".cookie-consent",
      ".cookie-banner",
      ".cookie-notice",
      "[class*='cookie']",
      "[id*='cookie']",
      "[class*='consent']",
      "[id*='consent']",
      "[class*='gdpr']",
      "[id*='gdpr']",
    ] as readonly string[],
  },
  worker: {
    pollIntervalMs: 3_000,
    heartbeatStaleMs: 30_000, // UI treats the worker as down if no heartbeat within this window
  },
  defaults: {
    maxPages: envInt("MAX_PAGES_DEFAULT", 200),
    retries: 2, // retry a transient capture failure up to this many times
    retryBackoffMs: 1_500,
  },
} as const;

export const WORKER_HEARTBEAT_ID = "worker";
