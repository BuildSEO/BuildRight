# 07 · Capture Pipeline & Worker

> Status: **planned / design** — these modules belong to future phases (3–6). Nothing here is built yet.
> This document defines the **contracts** (TypeScript signatures, data flow, failure semantics) the capture
> subsystem will be built against, so the schema and worker split decided in earlier phases are honoured.
> The authoritative source for each module is its matching phase file under `./phases/`
> (Phase 3 → discovery, Phase 4 → capture, Phase 5 → compression, Phase 6 → pipeline + worker); this doc is the
> cross-cutting spine that ties them together.
> Last updated: 2026-06-23.

This is the design spine for everything under `src/capture/` plus the long-running `src/worker/index.ts`. The capture
subsystem is the only place in BuildRight that runs Playwright, touches the network at scale, or writes archive files.
The API never does any of this — it writes a `queued` `Snapshot` row and returns ([Architecture](./03-architecture.md)).
The worker polls for that row and drives the pipeline described below.

Related docs:

- [Architecture](./03-architecture.md) — the API-writes-queued-row / worker-polls split this pipeline implements.
- [Data model](./06-data-model.md) — authoritative `Project` / `Snapshot` / `Page` schema and status state machines. This
  doc says **who writes which column and when**; that doc says **what the columns are**.
- [Folder structure](./04-folder-structure.md) — where these modules live on disk.
- [Conventions](./05-conventions.md) — the Phase 0 coding rules (strict TS, no `any`, logger not `console.log`, try/catch
  every external op, zod at boundaries, small single-responsibility modules) that every module below obeys.
- [API & UI](./08-api-and-ui.md) — the thin API that enqueues the `Snapshot` row and the UI that polls progress.
- [Risks & scaling](./10-risks-and-scaling.md) — the p-queue→BullMQ / SQLite→Postgres / disk→S3 swap notes referenced
  throughout.

---

## 1. Module map & responsibilities

Five modules, each a small single-responsibility unit. Discovery, capture, and compression are designed as **pure-ish**
functions (input → output, no hidden DB writes) so they unit-test in isolation; `pipeline.ts` and `worker/index.ts` are
the only modules that touch Prisma and the filesystem.

| Module | File | Phase | Responsibility | Touches DB? | Touches disk? | Runs Playwright? |
| --- | --- | --- | --- | --- | --- | --- |
| Discovery | `src/capture/discover.ts` | 3 | Produce the list of URLs to capture (sitemap-first, crawl fallback) | No | No | **No** — `fetch` + light HTML parser only |
| Capture | `src/capture/capture.ts` | 4 | Navigate one URL, screenshot it, extract SEO fields | No | No | Yes (uses a shared `Browser`) |
| Compress | `src/capture/compress.ts` | 5 | PNG→WebP under 5 MB; PNG→JPEG→paginated PDF | No | No | No |
| Pipeline | `src/capture/pipeline.ts` | 6 | Orchestrate one page end-to-end; write files + update `Page` | Yes | Yes | Via `capture.ts` |
| Worker | `src/worker/index.ts` | 6 | Long-running loop: claim snapshot → discover → capture all → finalize | Yes | Yes | Owns the browser |

```
worker/index.ts
   │  poll → claim queued Snapshot
   ├─► discover.ts        → string[] of URLs            (no side effects, no browser)
   │      writes Page rows + Snapshot.totalPages
   ├─► launch ONE chromium Browser
   └─► p-queue (concurrency 3–4)
          └─► pipeline.ts: captureOnePage(browser, pageRow)
                 ├─► capture.ts   → { httpStatus, pngBuffer, dims, html, extracted }
                 ├─► compress.ts  → { buffer, quality } (+ optional pdf)
                 ├─► paths.ts     → write .webp / .html.gz / .pdf
                 └─► db: update Page (done|failed) + Snapshot.donePages++
```

The worker owns exactly **one** Playwright `Browser` instance and passes it down into `capture.ts`, which opens **one
context per page** and always closes it. Lower modules never launch or close the browser — that lifecycle belongs to the
worker. Discovery does **not** use Playwright at all: it is plain `fetch` plus a lightweight HTML parser, so it can run
before the browser is even launched.

---

## 2. `discover.ts` — URL discovery (Phase 3)

**Goal:** given a project domain and discovery options, return a normalized, deduped, same-origin list of URLs, capped at
`maxPages`. Sitemap-first; crawl is both the explicit `"crawl"` mode **and** the automatic fallback when the sitemap path
yields nothing. Authoritative source: `./phases/phase-03-discovery.md`.

### 2.1 Public contract

```ts
export async function discoverUrls(
  domain: string,
  opts: { mode: "sitemap" | "crawl"; maxPages: number },
): Promise<string[]>;
```

`discoverUrls()` is **side-effect-free**: it returns the URL list and nothing else. The worker, not this module, writes
`Page` rows and `Snapshot.totalPages`. Every network call inside is wrapped in try/catch and logged via `logger`
([Conventions](./05-conventions.md)); a failed sitemap fetch logs a **warning** and falls back to crawl, never throws an
error that aborts the run.

It also ships a manual harness:

```
scripts/test-discover.ts   # run with tsx; takes a domain arg; prints the URL list + count
```

### 2.2 Domain normalization

Before anything else, normalize `domain` to a **base origin**: force `https://`, strip any trailing slash, lowercase the
host. All discovered URLs are compared against this origin for same-origin filtering.

### 2.3 Sitemap mode

1. Fetch `/robots.txt`; parse every `Sitemap:` line. If none are found, default to `/sitemap.xml`.
2. Fetch each sitemap with **`fast-xml-parser`**. Handle **both** shapes:
   - `<urlset>` — a list of `<url><loc>` entries (leaf page URLs).
   - `<sitemapindex>` — a list of nested `<sitemap><loc>` entries. **Recurse** into each nested sitemap and collect their
     `<loc>` URLs.
3. Collect all `<loc>` values across the tree, normalize and dedupe (§2.5), and cap to `maxPages`.
4. If the sitemap path yields **zero** usable URLs, fall back to crawl mode (§2.4).

### 2.4 Crawl mode (also the fallback)

Crawl mode is BFS from the homepage using **`fetch` + a lightweight HTML parser** to extract `<a href>` links. It does
**not** launch a browser — discover.ts never runs Playwright.

- **Seed** with the homepage. BFS frontier keyed by normalized URL; a `visited` set prevents revisits.
- **Same-origin only** — compare against the normalized base origin; reject other hosts.
- **Respect `maxPages`** — stop once the cap is reached. This is the primary guard against crawl traps.
- Network calls wrapped in try/catch + logged.

### 2.5 Normalization, dedupe & exclusion (both modes)

For **both** sitemap and crawl, every candidate URL goes through the same normalization:

- Strip `#fragments`.
- Strip common tracking params (`utm_*`, `fbclid`, `gclid`).
- Resolve relative → absolute against the page/base origin.
- Lowercase the host.
- Collapse trailing slashes consistently.
- Dedupe.
- Exclude obvious non-content via a **configurable** list: `/wp-admin`, `/wp-login`, `mailto:`, `tel:`, `logout`, and file
  extensions like `.pdf` / `.jpg` / `.zip`.
- Cap the final result to `maxPages`.

The normalizer is the highest-value unit-test target and is what makes the `@@unique([snapshotId, url])` constraint in the
schema a safety net rather than a tripwire.

### 2.6 Edge cases

| Edge | Handling |
| --- | --- |
| Sitemap-of-sitemaps (e.g. WordPress/Yoast `/sitemap_index.xml`) | Confirm `<sitemapindex>` recursion descends into every nested sitemap. |
| Gzipped sitemaps (`.xml.gz`) | These exist in the wild — gunzip before handing bytes to `fast-xml-parser`. |
| Crawl traps (faceted search / calendars) | `maxPages` cap + the exclusion list guard against unbounded frontiers. |
| Sitemap fetch failure | Log a **warning**, fall back to crawl mode — never abort the snapshot. |

---

## 3. `capture.ts` — Playwright capture + in-page extraction (Phase 4)

**Goal:** given a shared Playwright `Browser` (owned by the worker) and one URL, navigate, capture HTTP status, take a
full-page PNG, and extract all SEO fields in a single `page.evaluate`. Returns plain data — no DB, no disk. This is the
heart of the system. Authoritative source: `./phases/phase-04-capture.md`.

### 3.1 Public contract

```ts
import type { Browser } from "playwright";

export async function capturePage(
  browser: Browser,
  url: string,
): Promise<{
  httpStatus: number | null;   // from the MAIN navigation response
  pngBuffer: Buffer;           // full-page PNG, pre-compression
  width: number;               // rendered page width
  height: number;              // full-page content height
  html: string;                // page.content() — gzipped later by pipeline
  extracted: {
    title: string | null;
    metaDescription: string | null;
    canonical: string | null;
    metaRobots: string | null;
    headings: { h1: string[]; h2: string[]; h3: string[]; h4: string[]; h5: string[]; h6: string[] };
    h1: string | null;                                   // first H1, for the page table
    schema: unknown[];                                   // parsed JSON-LD blocks
    links: { href: string; anchor: string; internal: boolean }[];
    wordCount: number;
  };
}>;
```

`capturePage` accepts a **shared `Browser`** (created once by the caller and reused across all pages) — **not** a context.
It opens its own context per call and closes it in a `finally` block. The caller serializes the result into `Page`
columns: `headings` / `schema` / `links` are `JSON.stringify`'d into the string columns
([Data model](./06-data-model.md)); `pngBuffer` is handed to `compress.ts`; `html` is gzipped to `htmlGzPath`.

On failure it **throws an error with the `url` in the message**; the caller (pipeline) records it as a failed page.

It also ships a manual harness:

```
scripts/test-capture.ts   # launch chromium; capturePage on a url arg; write PNG to test.png; print extracted JSON
```

### 3.2 Steps (in order)

1. **New context + page.** Viewport width **1440**, `deviceScaleFactor` **1.5**, a realistic user agent. Open a new page.
2. **Navigate.** `page.goto(url, { waitUntil: "networkidle", timeout: 30_000 })`. Capture the response status. If
   `networkidle` times out, **retry with `waitUntil: "domcontentloaded"`** and continue, adding a fixed **2–3s settle
   delay** afterward. `httpStatus` comes from the **main navigation response**.
3. **Hide consent/cookie overlays (don't click).** Inject a `<style>` that sets `display:none` on common containers
   (`#onetrust-banner-sdk`, `.cookie-consent`, `[class*="cookie"]`, `[id*="consent"]`, and full-screen `position:fixed`
   overlays). Keep the selector list in **one growing constant**.
4. **Trigger lazy-loading.** Auto-scroll top→bottom in steps (e.g. 800px every 100ms) until no more height is added **or**
   a max height cap of **25000px** is hit; then scroll back to top. **Log when the cap is hit** (the page is clipped).
5. **Wait for paint.** `await page.evaluate(() => document.fonts.ready)` and wait until all `<img>` are complete (or a
   **5s ceiling**).
6. **Optional sticky-header neutralize.** Set `position:static` on top fixed/sticky elements, toggled via a `const` flag.
7. **Screenshot.** `page.screenshot({ fullPage: true, type: "png" })`; read page dimensions (`width`/`height`).
8. **Single `page.evaluate()`** returning the extracted object (§3.3).
9. `html = await page.content()`.
10. **Always close the context** in a `finally` block — one browser, one context **per page**, always closed (else memory
    leaks accumulate across ~200 pages).

### 3.3 In-page extraction (single `page.evaluate`)

A single `page.evaluate` runs in the browser context and returns the `extracted` object. Keeping it one round-trip keeps
capture fast and the extraction logic colocated.

- `title` = `document.title`.
- `metaDescription` = `meta[name="description"]` content.
- `canonical` = `link[rel="canonical"]` href.
- `metaRobots` = `meta[name="robots"]` content.
- `headings` = `h1`..`h6`, each an array of trimmed text content.
- `h1` = the **first** H1 (for the page table summary).
- `schema` = all `<script type="application/ld+json">`, `JSON.parse` inside try/catch, **skipping invalid blocks** so one
  bad `<script>` never loses the others.
- `links` = all `<a href>` resolved absolute; `anchor` = trimmed text; `internal` = same host as the page.
- `wordCount` = visible body text split on whitespace.

### 3.4 HTTP status semantics

`httpStatus` comes from the **main** navigation response. A `404`/`500` is still a valid capture — we archive the page as
it was and record the real status; it is **not** a pipeline failure (see §6 failure taxonomy). Very tall pages are bounded
by the 25000px scroll cap in step 4 — see [Risks](./10-risks-and-scaling.md) and §4.4.

---

## 4. `compress.ts` — WebP under 5 MB + paginated PDF (Phase 5)

**Goal:** turn the lossless PNG into a WebP **guaranteed under 5 MB**, and (optionally) build a paginated PDF. Pure
functions over buffers — no disk, no DB. Easiest module to unit-test (feed a buffer, assert size/format). Authoritative
source: `./phases/phase-05-compression.md`.

### 4.1 Public contract

```ts
export async function toWebpUnderLimit(
  png: Buffer,
  limitBytes = 5_000_000,
): Promise<{ buffer: Buffer; quality: number }>;

export async function toPdf(png: Buffer, pageHeightPx = 1400): Promise<Buffer>;
```

### 4.2 `toWebpUnderLimit` — quality ladder + downscale

`sharp().webp({ quality })` re-encodes at descending quality until the buffer fits `limitBytes`:

1. Start at **quality 82**.
2. If over the limit, step quality down the ladder: **82 → 70 → 60 → 50**.
3. If still over the limit at quality **50**, **downscale width by 15%** and retry the whole quality ladder.
4. Return the **first** buffer under the limit, along with the `quality` used.

**Log when it has to downscale.** If even quality 50 + downscale still cannot hit 5 MB, **log and store the best-effort
buffer rather than failing the capture** — the screenshot is the deliverable, an oversized one beats none. The `sharp`
call is wrapped in try/catch and logged.

### 4.3 `toPdf` — convert to JPEG, slice into strips

`pdf-lib` embeds **JPEG or PNG, not WebP**. So:

1. **Convert the PNG → JPEG via `sharp` first** (pdf-lib cannot embed WebP).
2. Slice the tall image into vertical strips of `pageHeightPx` (default **1400px**), one PDF page per strip, so nothing is
   cut off.
3. Return the PDF bytes.

PDF is **optional** — the pipeline only calls `toPdf` when export is requested, and `pdfPath` stays `null` otherwise.

### 4.4 Edge: WebP max dimension

WebP's maximum dimension is **16383px**, so very tall pages exceed it and `sharp` errors. Handle this explicitly by either
**tiling into stacked WebP tiles** OR **capping the capture height** — tie this to the **25000px** scroll cap from Phase 4
(§3.2 step 4). This must be noted in the implementation, not left implicit.

---

## 5. `pipeline.ts` — one-page orchestration (Phase 6)

**Goal:** capture **one** URL end-to-end and persist it, with bulletproof per-page failure isolation. This is the unit the
worker hands to `p-queue`. Authoritative source: `./phases/phase-06-pipeline-worker.md`.

### 5.1 Public contract

```ts
import type { Browser } from "playwright";
import type { Page } from "@prisma/client"; // the Page row to capture

/** Capture + persist ONE page. Resolves whether the page succeeded or failed — NEVER throws out. */
export async function captureOnePage(browser: Browser, page: Page): Promise<void>;
```

The **never-throws-out** contract is load-bearing: `p-queue` runs many of these concurrently, and one bad page must not
kill the run or crash the worker. All errors are caught, logged, and written to `Page.error`.

### 5.2 Steps

```ts
export async function captureOnePage(browser, page /* Page row */) {
  try {
    // 1. const cap = await capturePage(browser, page.url);
    // 2. const { buffer, quality } = await toWebpUnderLimit(cap.pngBuffer);
    // 3. const pdf = exportPdf ? await toPdf(cap.pngBuffer) : undefined;   // optional
    // 4. const htmlGz = gzip(cap.html);
    // 5. write files under snapshotDir(projectId, snapshotId) via paths.ts:
    //      .webp (always), .pdf (optional), .html.gz (always)
    // 6. update Page row: status "done", httpStatus,
    //      title, metaDescription, canonical, metaRobots, h1,
    //      headings/schema/links (JSON.stringify), wordCount,
    //      screenshotPath, pdfPath?, htmlGzPath, width, height, fileSizeBytes, capturedAt = now()
  } catch (err) {
    logger.error("pipeline: page capture failed", { url: page.url, snapshotId: page.snapshotId, err });
    // update Page row: status "failed", error = message (with url)
  }
}
```

- File paths come exclusively from `paths.ts` (`snapshotDir(projectId, snapshotId)`) — no path string-building here; the DB
  stores **relative** paths ([Data model](./06-data-model.md)).
- `headings` / `schema` / `links` are persisted with `JSON.stringify`.
- A `404`/`500` HTTP status is a **successful** capture (`status: "done"`) — we archived the page as it was. Failure means
  we could not produce an artifact (nav crash, compress fatal, disk error), tracked separately in §6.
- The worker increments `Snapshot.donePages` after this resolves (§8), so the function itself just persists one row.

---

## 6. Failure taxonomy & per-page isolation

| Situation | `Page.status` | `httpStatus` | Run continues? | Notes |
| --- | --- | --- | --- | --- |
| Page loads, `200` | `done` | `200` | yes | Happy path. |
| Page loads, `404`/`500` | `done` | `404`/`500` | yes | Archived as-is — that's the proof. |
| `networkidle` timeout | `done` | set | yes | Retried as `domcontentloaded` + settle delay (§3.2). |
| Nav crash / `net::ERR_*` | `failed` | `null` | yes | `Page.error` carries the url; one bad page never kills the run. |
| Compress can't hit 5 MB | `done` | set | yes | Best-effort buffer stored, logged (§4.2) — not a failure. |
| `sharp`/PDF fatal error | `failed` | maybe set | yes | Artifact couldn't be produced. |
| Disk write error | `failed` | maybe set | yes | Logged; investigate volume. |
| Per-page timeout breached | `failed` | maybe set | yes | One hanging page can't stall the queue (§7). |
| Discovery yields 0 URLs | — | — | Snapshot `failed` | Whole-run failure; set `Snapshot.error`. |
| SIGINT/SIGTERM mid-run | in-flight finishes | — | run stops | Graceful drain (§8); un-done pages resumable next start. |

The guiding rule from [Conventions](./05-conventions.md): **every external operation in try/catch, never swallow,
always log, isolate the blast radius to one page.** `captureOnePage` never throws out — it converts every error into a
`failed` row.

---

## 7. Timeouts, concurrency & retry policy

### 7.1 Concurrency model

- **One browser, many contexts.** The worker launches a single Chromium `Browser`; `p-queue` runs `captureOnePage` at a
  bounded concurrency of **3–4** (a config constant). Each task opens its **own context per page** via `capture.ts` and
  always closes it. This keeps memory bounded (Chromium contexts are heavy) while still parallelizing the network/CPU wait.
- Concurrency **3–4** is the sweet spot on a laptop; higher risks OOM on tall pages. See
  [Risks & scaling](./10-risks-and-scaling.md).

### 7.2 Timeouts

| Phase | Default | Behaviour on breach |
| --- | --- | --- |
| Sitemap / robots fetch | per-fetch | log warning, fall back to crawl (§2) |
| Navigation `networkidle` | 30 s | retry with `domcontentloaded` + 2–3s settle (§3.2) |
| Font / image settle | 5 s ceiling | proceed to screenshot |
| Per-page overall | small per-page timeout | page `failed`, freed from queue so one hang can't stall it |

### 7.3 Retry policy

- **Navigation:** the `networkidle → domcontentloaded` fallback in `capturePage` is the built-in retry for slow/long-poll
  pages; success there is still `done`.
- **No global retry storm:** a snapshot never re-runs itself automatically; failures are per-page and bounded.
- **Resume, not retry, after a crash:** a worker that died mid-run resumes its stuck pages on restart (§8) rather than
  retrying from scratch.

---

## 8. `worker/index.ts` — the long-running loop (Phase 6)

**Goal:** a single long-lived process that owns the browser, polls the DB for work, drives discovery + capture for one
snapshot at a time, writes live progress, and shuts down gracefully. Authoritative source:
`./phases/phase-06-pipeline-worker.md`.

### 8.1 Startup tasks

1. **Enable WAL once.** Run `PRAGMA journal_mode=WAL` at startup so concurrent `donePages` writes don't trip SQLite's
   "database is locked".
2. **Resume stuck snapshots.** Any `Snapshot` left in status `capturing` (from a crashed worker) has its **un-done pages
   reset back to `queued`** so the snapshot can **resume** instead of hanging forever.
3. Install SIGINT/SIGTERM handlers (§8.3), then enter the poll loop.

### 8.2 Main loop

```
on startup: PRAGMA journal_mode=WAL; reset un-done pages of any "capturing" snapshot → "queued"
loop every few seconds (until shutting down):
  (1) find the OLDEST Snapshot with status "queued"
      if none: sleep + repeat
  (2) set status = "discovering"
      urls = await discoverUrls(domain, { mode: snapshot.discovery, maxPages: snapshot.maxPages })
      if urls.length === 0: throw "no URLs discovered"   // → snapshot "failed"
      insert a Page row (status "queued") per URL
      set Snapshot.totalPages = urls.length
  (3) set status = "capturing"
      launch ONE chromium Browser
      queue = new PQueue({ concurrency: 3..4 })   // config constant
      for each queued page:
        queue.add(() => captureOnePage(browser, page))   // never throws out
        // increment Snapshot.donePages after each settles
  (4) await queue.onIdle()  → set status = "done", finishedAt = now(); close browser
  (5) wrap the whole snapshot in try/catch → on fatal error: status "failed", error = message
```

- **One snapshot at a time** per worker keeps the browser's memory predictable. Parallelism is *within* a snapshot via
  `p-queue` (concurrency 3–4), not across snapshots.
- **Live progress.** `Snapshot.donePages` is incremented after each page settles (use Prisma's atomic `{ increment: 1 }`).
  The UI polls `donePages / totalPages` — no push channel needed for local-first ([API & UI](./08-api-and-ui.md)).
- **Logger throughout** — snapshot id, page url, and timings on every step ([Conventions](./05-conventions.md)).
- There is **no** worker-assembled combined-PDF export job; per-page PDFs are produced inline by `captureOnePage` when
  requested (§5).

### 8.3 Graceful shutdown

```ts
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
```

On signal: **stop taking new work**, let in-flight `p-queue` tasks **finish**, then `await browser.close()` and exit. A
page row is only flipped to `done` after its files are written, so no partial file is left referenced by a `done` row. Any
`capturing` snapshot whose pages didn't all finish is recoverable: the next worker startup resets its un-done pages to
`queued` and resumes (§8.1).

### 8.4 Edge cases

| Edge | Handling |
| --- | --- |
| SQLite "database is locked" | Enable `PRAGMA journal_mode=WAL` once at startup. |
| Worker crashed mid-run, snapshot stuck `capturing` | On startup, reset that snapshot's un-done pages to `queued` to resume. |
| One hanging page stalls the queue | Small per-page timeout frees the slot; page marked `failed`. |
| Memory growth over ~200 pages | One browser, one context **per page**, always closed in a `finally` (§3.2). |
| Concurrency tuning | 3–4 is the sweet spot; expose as a config constant. |

---

## 9. Scaling note: p-queue → BullMQ (local-first → cloud)

The worker split is deliberately the **same shape** as the cloud target, so nothing here is throwaway:

| Concern | Local-first (now) | Cloud (later) | Swap surface |
| --- | --- | --- | --- |
| Job queue | `p-queue` in-process (concurrency 3–4) | BullMQ + Redis | `worker/index.ts` queue construction only |
| Claim | "oldest queued" guarded update | BullMQ atomic job lock | the poll/claim step in `worker/index.ts` |
| DB | SQLite + WAL (`data/`) | Postgres | `src/lib/db.ts` + Prisma datasource |
| Storage | local disk (`data/archive`, via `paths.ts`) | S3 | `paths.ts` write helpers |
| Workers | one process, resumes stuck snapshots on boot | N horizontally-scaled workers | run more copies of the same binary |

Because `discover.ts` / `capture.ts` / `compress.ts` are pure over their inputs and `pipeline.ts` already isolates
per-page failure (`captureOnePage` never throws out), scaling out is "run more workers + swap the queue/storage adapters."
The capture logic does not change. See [Risks & scaling](./10-risks-and-scaling.md) for the full migration plan.

---

## 10. Build checklist (future phases)

- [ ] **Phase 3** `discover.ts`: `discoverUrls(domain, { mode, maxPages })` — `fetch` + light HTML parser, **no
      Playwright**.
- [ ] **Phase 3** sitemap mode: robots.txt `Sitemap:` lines → `/sitemap.xml` default; `fast-xml-parser`; `<urlset>` **and**
      `<sitemapindex>` with recursion; gunzip `.xml.gz`.
- [ ] **Phase 3** crawl mode/fallback: BFS via `fetch`, same-origin, `maxPages` cap, configurable exclusion list; warn +
      fall back from sitemap on failure. `scripts/test-discover.ts`.
- [ ] **Phase 3** normalize: strip fragments + `utm_*`/`fbclid`/`gclid`, resolve relative, lowercase host, collapse
      trailing slashes, dedupe, cap.
- [ ] **Phase 4** `capture.ts`: `capturePage(browser, url)` — shared `Browser`, context-per-page closed in `finally`,
      viewport 1440 / DSR 1.5, `networkidle`→`domcontentloaded` fallback, cookie-hide, auto-scroll lazy-load (25000px cap),
      fonts/img waits, optional sticky-header neutralize, full-page PNG, single-`evaluate` extraction. `scripts/test-capture.ts`.
- [ ] **Phase 5** `compress.ts`: `toWebpUnderLimit(png, limitBytes)` → `{ buffer, quality }` ladder 82→70→60→50 + 15%
      downscale (best-effort store, log); `toPdf(png, pageHeightPx)` → JPEG-first, 1400px strips; handle WebP 16383px max.
- [ ] **Phase 6** `pipeline.ts`: `captureOnePage(browser, pageRow)` end-to-end, never-throws-out, writes `.webp` /
      `.html.gz` / optional `.pdf` via `paths.ts`, updates `Page` row.
- [ ] **Phase 6** `worker/index.ts`: WAL on boot, resume stuck `capturing` pages, poll oldest queued, discover → insert
      Page rows + totalPages, launch one browser, `p-queue` concurrency 3–4, atomic `donePages`, finalize, graceful
      SIGINT/SIGTERM.
- [ ] All modules: logger (not `console.log`), try/catch on every network/browser/disk op, strict TS, no `any`.
- [ ] Verify: queue a snapshot via API → worker captures it → `data/archive` has `.webp`/`.html.gz`, `Page` rows `done`,
      `Snapshot.status = done`, `donePages === totalPages` ([Testing & verification](./09-testing-and-verification.md)).

> Reminder: this is forward-looking design — the authoritative source for each module is its phase file under
> `./phases/`. Build the modules in the order above only when the corresponding phase is opened; do not build ahead
> ([Phase 0 rules](./05-conventions.md)).
