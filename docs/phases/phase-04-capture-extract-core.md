# Phase 4 · Capture & Extract Core (the heart)

_Status: ✅ provided · last updated 2026-06-23 · workstream: Capture Engine_

## Goal

A single, testable function that loads one URL and returns the screenshot buffer + all extracted SEO data + status +
raw HTML. **Get this rock-solid before anything else** — most bugs in the whole system live here.

## Prompt to paste

```text
TASK 4: Build src/capture/capture.ts.

Export: async function capturePage(browser: Browser, url: string): Promise<{
  httpStatus: number | null;
  pngBuffer: Buffer;
  width: number; height: number;
  html: string;
  extracted: {
    title, metaDescription, canonical, metaRobots,
    headings: { h1:[], h2:[], h3:[], h4:[], h5:[], h6:[] },
    h1: string | null,            // first H1 for the table
    schema: any[],                // parsed JSON-LD blocks
    links: { href, anchor, internal }[],
    wordCount: number
  }
}>

Accept a shared Playwright Browser (created by the caller, reused across pages).

Steps inside:
1. Create a new browser context with viewport width 1440, deviceScaleFactor 1.5,
   a realistic user agent. New page.
2. Navigate: page.goto(url, { waitUntil: "networkidle", timeout: 30000 }).
   Capture the response status. If networkidle times out, retry with
   "domcontentloaded" and continue. Record httpStatus from the response.
3. Dismiss/hide overlays: inject a <style> that sets display:none on common
   cookie/consent/GDPR containers (cookie banners, #onetrust-banner-sdk,
   .cookie-consent, [class*="cookie"], [id*="consent"], etc.) and any
   position:fixed full-screen overlays. (Hide, don't click — safer for archival.)
4. Trigger lazy-loading: auto-scroll from top to bottom in steps (e.g. 800px
   every 100ms) until no more height is added or a max height cap (25000px) is hit,
   then scroll back to top.
5. Wait for fonts and images: await page.evaluate(() => document.fonts.ready) and
   wait until all <img> are complete (or a 5s ceiling).
6. Optionally neutralize sticky headers: set position:static on elements that are
   position:fixed/sticky at the top (toggle via a const flag at top of file).
7. Screenshot: fullPage:true, type "png". Read page dimensions.
8. Extract via a SINGLE page.evaluate() that returns the extracted object above:
   - title = document.title
   - metaDescription, canonical (link[rel=canonical]), metaRobots (meta[name=robots])
   - headings: query all h1..h6, trim text
   - schema: all <script type="application/ld+json">, JSON.parse each in a
     try/catch, skip invalid ones
   - links: all <a href>, resolve to absolute, anchor = trimmed text,
     internal = same host as the page
   - wordCount: visible body text split on whitespace
9. Grab html = await page.content().
10. Close the context (always, in a finally block).

Wrap everything so a failure returns a thrown error with the url in the message;
the caller decides how to record it.

Write scripts/test-capture.ts: launches chromium, calls capturePage on a URL arg,
writes the PNG to disk as test.png, and prints the extracted JSON. Run it on a
few real sites to confirm.
```

## Task breakdown

- [ ] **4.1** `capturePage(browser, url)` — accept a **shared** `Browser`; create a fresh context per page (viewport 1440, `deviceScaleFactor` 1.5, realistic UA); new page.
- [ ] **4.2** Navigate `networkidle` (30s); record main-response `httpStatus`; on timeout **retry** `domcontentloaded` + a 2–3s settle.
- [ ] **4.3** Hide cookie/consent/GDPR overlays via injected `<style>` (display:none) — **hide, don't click**; keep selectors in one growing constant.
- [ ] **4.4** Auto-scroll lazy-load (800px / 100ms) to bottom or **25000px cap**; log when capped; scroll back to top.
- [ ] **4.5** `await document.fonts.ready`; wait for `<img>` complete (5s ceiling).
- [ ] **4.6** Optional sticky-header neutralize (`position:static`) behind a const flag.
- [ ] **4.7** Full-page PNG screenshot; read width/height.
- [ ] **4.8** **Single** `page.evaluate()` extraction: title, metaDescription, canonical, metaRobots, headings h1–h6, first h1, JSON-LD (parse each, skip invalid), links (absolute href + anchor + `internal` = same host), wordCount.
- [ ] **4.9** `html = await page.content()`.
- [ ] **4.10** Always close the context in `finally`. Throw on failure with the URL in the message.
- [ ] **4.11** `scripts/test-capture.ts` writes `test.png` + prints extracted JSON.

## Files this phase creates

- `src/capture/capture.ts`
- `scripts/test-capture.ts`

> Full design contract: [07 · Capture Pipeline §3](../07-capture-pipeline.md). The extraction logic should be authored so
> it can be unit-tested over HTML strings ([09 · Testing §4.3](../09-testing-and-verification.md)).

## Run & verify

```bash
npx tsx scripts/test-capture.ts https://stripe.com
```

- [ ] `test.png` is a clean full-page shot — **no cookie banner**, lazy images loaded.
- [ ] Printed JSON has real `title` / `h1` / `schema` / `links`.
- [ ] Re-run on a few different real sites (SPA, long landing page, news site).

## Debug / edge cases (this is where most bugs live)

- **Blank/gray sections** → lazy-load scroll didn't reach bottom; increase scroll wait, confirm step 4 hit the bottom.
- **Cookie banner still in shot** → add the site's specific selector to the hide-list constant.
- **Infinite-scroll pages never settle** → the 25000px cap stops them; log when capped so you know the page is clipped.
- **`networkidle` never fires** (polling/analytics) → `domcontentloaded` fallback + a fixed 2–3s settle delay.
- **Status code** comes from the **main navigation** response; redirects report the final 200 (correct — you archive the
  live page). If you want to know it redirected, log `response.request().redirectedFrom()`.
- **Context per page** (step 1) so cookies/state don't leak between pages; always close it.

## Dependencies

Phase 1 (Playwright + logger). Feeds Phase 5 (compression) and Phase 6 (pipeline/worker).

## Definition of Done

- [ ] Tasks 4.1–4.11 complete; context always closed; failures throw with the URL.
- [ ] `scripts/test-capture.ts` produces a clean shot + correct extracted JSON on several real sites.
- [ ] `tsc --noEmit` + `eslint` clean; logger used (no `console.log`).
- [ ] Committed (e.g. `feat(capture): full-page capture + single-evaluate SEO extraction`).
