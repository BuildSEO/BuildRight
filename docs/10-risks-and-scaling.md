# 10 · Risks & Scaling

> Planning document for the **SEO Snapshot Tool** (codename **BuildRight**).
> Last updated: **2026-06-23**.
> Related docs: [Architecture](./03-architecture.md) · [Capture pipeline](./07-capture-pipeline.md) · [Data model](./06-data-model.md) · [Testing](./09-testing-and-verification.md) · [Task board](./11-task-board.md)

This document is the **risk register** for the capture pipeline and worker, plus the **scaling path** that takes us from local-first SQLite/disk to a cloud deployment. Phases 3–12 are not yet specified; mitigations here are written as **design intent** for those phases unless they land in already-built modules (`src/lib/*`, Phase 1–2). Forward-looking items are marked *(planned)*.

The header for every risk is the **same worker-split shape** the project already committed to: the **API never runs Playwright** — it validates input, writes a `queued` Snapshot row, and returns. A **separate long-running worker** (`src/worker/index.ts`) polls the DB and does all heavy work. Almost every mitigation below is *enforced in the worker/capture layer*, never the request path, which is exactly why the same defenses survive the swap to BullMQ + Postgres + S3.

---

## Risk register

Each row ties its mitigation to a **specific module** so it is clear where the code (or guard) lives. Likelihood/Impact are **Low / Med / High** for a typical agency client site.

| # | Risk | Impact | Likelihood | Mitigation | Owner module |
|---|------|--------|------------|------------|--------------|
| R1 | **Huge sites / runaway crawl** — discovery never terminates, or explores millions of URLs / off-site links. | High | Med | Hard `maxPages` cap (default 200, from `Snapshot.maxPages`) enforced as a counter in the discovery loop; **max depth cap** on the BFS crawl fallback; **same-origin only** filter (compare normalized host + protocol, drop subdomains unless equal); dedupe via a visited `Set` and the DB `@@unique([snapshotId,url])`. Stop the moment `maxPages` is hit and mark remaining queue dropped. | `src/capture/discover.ts` |
| R2 | **Memory blowup from full-page screenshots** — a 60k-px-tall page rendered `fullPage:true` produces a giant raw bitmap and OOMs the worker. | High | Med | Capture pages **sequentially within the p-queue concurrency cap** (never N full-page shots in parallel); enforce a **max viewport/page-height cap** — clamp via `page.setViewportSize` + a max scroll-height check, and if the page exceeds the cap, capture a clipped region and record `height` honestly; hand the buffer straight to `sharp` and free it. Concurrency is a single env-tunable knob so we can drop it to 1 on constrained hosts. | `src/capture/capture.ts`, `src/capture/pipeline.ts` |
| R3 | **WebP still > 5 MB after max compression** — extremely large/complex pages exceed the 5 MB target even at lowest acceptable quality. | Med | Low | `compress.ts` runs a **bounded quality ladder** (step down WebP quality), then **downscales dimensions** (cap width, proportional height) and retries; if still over budget, write the best-effort file, record real `fileSizeBytes`, and **log a documented WARN fallback** rather than failing the page. The 5 MB target is a soft cap, not a hard failure. | `src/capture/compress.ts` |
| R4 | **Malformed / deeply-nested / giant sitemaps** — invalid XML, recursive sitemap-index loops, or a 100 MB sitemap. | Med | Med | `fast-xml-parser` parse wrapped in try/catch; on parse failure **fall back to crawl** (`discovery="crawl"`) instead of throwing; cap **sitemap-index recursion depth** and total sitemaps fetched; cap **bytes downloaded per sitemap** (stream/length guard); dedupe nested index entries against a visited set to break loops; URLs beyond `maxPages` are simply not enqueued. | `src/capture/discover.ts` |
| R5 | **JS-heavy SPA pages** — content renders client-side, so a naive capture grabs an empty shell. | Med | High | Use Playwright **explicit waits**: `waitUntil:'networkidle'` (bounded by timeout), an optional settle delay, and a scroll-to-bottom pass to trigger lazy-loaded images before the full-page shot. All waits are **timeout-bounded** so a hanging SPA fails that one page, not the run. | `src/capture/capture.ts` |
| R6 | **Anti-bot / Cloudflare blocks** — challenge pages or 403s instead of real content. | Med | Med | **Defensive only, no malicious evasion.** Set a clear, honest **User-Agent** and a sane Accept-Language; respect timeouts; on a block, record the actual `httpStatus` (e.g. 403/503) and a captured screenshot of the challenge so the failure is *visible and auditable*. We **do not** rotate IPs, solve CAPTCHAs, or spoof to bypass protections; blocked pages are reported as blocked. | `src/capture/capture.ts` |
| R7 | **SQLite write contention** — worker (status/progress updates) and API (new snapshots) write concurrently → `SQLITE_BUSY`. | Med | Med | Enable **WAL mode** + a `busy_timeout` pragma at startup; design for a **single writer in practice** (one worker process in local mode); keep **transactions short and row-scoped** (per-page updates, not run-long transactions); increment `donePages` in small atomic updates. WAL lets the API reader proceed while the worker writes. | `src/lib/db.ts` |
| R8 | **Disk-space growth / archive retention** — every snapshot stores WebP + gzipped HTML (+ optional PDF); repeated runs fill the disk. | Med | High | All assets live under a predictable, per-snapshot tree via `paths.ts` (`snapshotDir(projectId, snapshotId)`) so a run is one deletable directory; **gzip HTML** on disk (`htmlGzPath`); record `fileSizeBytes` per page for accounting; *(planned)* a retention policy / prune command and a disk-usage check before a run starts. | `src/lib/paths.ts`, `src/capture/compress.ts` |
| R9 | **Oversized combined PDFs** — a 200-page site exported as one PDF is enormous / slow / memory-heavy. | Med | Low | PDF export is **optional** and built page-by-page with `pdf-lib`, **streaming/appending** rather than holding all images in memory; embed the already-compressed WebP-derived assets, not raw PNGs; *(planned)* offer **chunked/per-section PDFs** and a size warning above a threshold. | `src/capture/compress.ts` |
| R10 | **Partial / failed runs & resumability** — worker crashes mid-run, or one page fails and poisons the whole snapshot. | High | Med | **Per-page failure isolation**: each page captured in its own try/catch; a failure sets `Page.status="failed"` + `Page.error` and the run continues. Status is driven by DB rows (`queued→capturing→done/failed`), so on restart the worker can **resume** by claiming the still-`queued`/`capturing` pages instead of restarting. The snapshot is `failed` only if it cannot proceed at all; otherwise it completes with some failed pages. | `src/capture/pipeline.ts`, `src/worker/index.ts` |
| R11 | **SSRF / abuse via user-supplied domains** — a malicious or careless input points the crawler at `localhost`, `169.254.169.254`, or an internal IP range. | High | Med | **Validate + normalize** the domain with `zod` at the API boundary; in discovery/capture, resolve and **block** `localhost`, loopback, link-local, and **private/reserved IP ranges** (RFC1918, `127.0.0.0/8`, `169.254.0.0/16`, `::1`, etc.); enforce **http/https only**; re-check on redirects so a public URL can't 302 into an internal one. Reject before any fetch/navigation. | `src/app/api/*` (zod), `src/capture/discover.ts`, `src/capture/capture.ts` |
| R12 | **Network flakiness / hung navigations** — slow DNS, dropped connections, infinite redirects. | Med | High | Every navigation and fetch is **timeout-bounded** and wrapped in try/catch with a **logged** error (`src/lib/logger.ts`, never `console.log`); cap **redirect chains**; failures are per-page (R10), not run-fatal. | `src/capture/capture.ts`, `src/capture/discover.ts` |

### Cross-cutting guarantees (Phase 0 rules, applied)

- [x] Every external op (network, browser, disk) is in `try/catch` and **logged via `src/lib/logger.ts`** — errors are never swallowed.
- [x] All API inputs validated with **zod** (notably the domain in R11).
- [x] Concurrency, `maxPages`, depth, dimension caps, and timeouts are **explicit, tunable knobs** (env / `Snapshot` fields), not magic numbers buried in logic.
- [x] Capture / discover / compress stay **pure and side-effect-light** where possible, so each risk's mitigation is **unit-testable in isolation**.

---

## Scaling path

The whole point of the worker split is that **none of the local-first choices are throwaway**. Each axis below swaps one implementation for a heavier one *behind the same seam*. The API contract (write a `queued` row, return) and the worker contract (poll → claim → capture → write progress) **do not change**.

### 1. SQLite → Postgres

- **Why it's already designed for this:** Prisma is the only DB access path; `src/lib/db.ts` is a single client singleton; every JSON-ish field (`headings`, `schema`, `links`) is stored as a string *because SQLite has no arrays* — the schema notes already call out that these become **`Json` columns** on Postgres.
- **Steps:**
  - [ ] Change the Prisma **datasource provider** `sqlite → postgresql` and point `DATABASE_URL` at Postgres.
  - [ ] Migrate the string-JSON fields to native **`Json`** columns (Prisma migration; parsing code at the edges drops the `JSON.parse`/`stringify`).
  - [ ] Replace WAL/`busy_timeout` (R7) reliance with Postgres MVCC — **multi-writer contention disappears**, enabling step 3.
  - [ ] Keep `@@unique([snapshotId,url])` — it carries over unchanged and still prevents duplicate captures.

### 2. p-queue → BullMQ + Redis

- **Why it's already designed for this:** capture concurrency is isolated to the worker via **p-queue** with a single concurrency knob; the API already does *not* enqueue in-process — it writes a DB row. The job unit (one Snapshot, fanned out to Pages) is already explicit.
- **Steps:**
  - [ ] Stand up **Redis**; replace the p-queue instance with a **BullMQ** queue/worker.
  - [ ] On snapshot creation, the API (or a thin producer) enqueues a BullMQ job referencing the `Snapshot.id` instead of relying purely on DB polling.
  - [ ] Gain **retries with backoff**, delayed/rate-limited jobs, and dead-letter handling for free — mapping cleanly onto the existing per-page failure isolation (R10).
  - [ ] Concurrency stays the same conceptual knob (BullMQ worker concurrency), so R2's "sequential within the cap" guarantee is preserved.

### 3. Single worker → horizontally-scaled workers

- **Why it's already designed for this:** state lives in the DB, not in worker memory; status transitions are row-based (`queued→capturing→done/failed`); resumability (R10) already assumes a worker can pick up another's in-flight work.
- **Steps:**
  - [ ] Add an **atomic job-claim** mechanism: an `ownerId` / `claimedAt` (lock) column on `Snapshot` (and/or `Page`), claimed with a single conditional `UPDATE ... WHERE status='queued'` so exactly one worker wins.
  - [ ] Add a **claim lease / heartbeat**: stale claims (worker died) are reclaimable after a TTL, which *is* the resumability story generalized to N workers.
  - [ ] With BullMQ (step 2), claiming is handled by Redis; with raw Postgres, use `SELECT ... FOR UPDATE SKIP LOCKED`.
  - [ ] Run **many worker replicas** behind the same DB/queue — no code change to capture logic, since R2's concurrency cap is *per worker*.

### 4. Local disk → S3 / object storage

- **Why it's already designed for this:** all path construction is centralized in **`src/lib/paths.ts`** (`snapshotDir`, `pageAssetPath`); the DB stores **relative** paths (`screenshotPath`, `pdfPath`, `htmlGzPath`), never absolute disk paths, and the writers in `compress.ts` are the only code touching the filesystem.
- **Steps:**
  - [ ] Introduce a small **storage interface** (`put/get/url`) with a local-disk impl (today) and an **S3** impl (cloud).
  - [ ] Reinterpret the existing relative paths as **object keys** — the same `snapshotDir/...` layout becomes the key prefix, so stored values need no migration.
  - [ ] Serve assets to the UI via **signed URLs** instead of a local file route.
  - [ ] Workers become **stateless** w.r.t. disk, which unblocks step 3 (replicas don't need shared local storage).

### 5. Observability

- **Why it's already designed for this:** Phase 0 mandates **structured logging via `src/lib/logger.ts`** (timestamp + level + message + meta JSON) and bans `console.log` in worker/capture code; progress is already tracked as data (`totalPages`, `donePages`, per-page `status`/`error`/`capturedAt`).
- **Steps:**
  - [ ] Ship structured logs to a **central sink** (stdout → log aggregator); the meta-JSON shape is already machine-parseable.
  - [ ] Emit **job metrics** — pages/sec, capture duration, failure rate, queue depth, WebP-over-budget count (R3), block rate (R6) — from the existing transition points.
  - [ ] Add health/heartbeat for worker replicas (feeds the stale-claim reclaim in step 3).
  - [ ] Build a **status dashboard** on top of TanStack Query polling the same `Snapshot`/`Page` rows the UI already reads for live progress — no new data source needed.

### Scaling-axis summary

| Axis | Local-first (now) | Cloud (planned) | Seam that makes it cheap |
|------|-------------------|-----------------|--------------------------|
| DB | SQLite + WAL | Postgres + `Json` cols | Prisma singleton (`src/lib/db.ts`) |
| Queue | p-queue (in-worker) | BullMQ + Redis | API writes a row; worker polls |
| Workers | 1 process | N replicas | Atomic claim via `ownerId`/lock column |
| Storage | Local disk | S3 / object store | Relative paths via `src/lib/paths.ts` |
| Observability | Structured logs | Logs + metrics + dashboard | `src/lib/logger.ts` + DB progress rows |

---

## Open questions

- [ ] Confirm exact numeric defaults for the **page-height/dimension caps** (R2) and the **WebP downscale floor** (R3).
- [ ] Confirm the **archive retention policy** (R8) — keep-forever vs. prune after N runs / N days, and whether a pre-run disk check should hard-block.
- [ ] Confirm whether per-page **PDF chunking** (R9) is in scope or whether a single combined PDF with a size warning is acceptable.
- [ ] Decide which DB the **atomic job claim** (Scaling §3) targets first — Postgres `SKIP LOCKED` vs. BullMQ — since it influences the §2 vs §3 ordering.
