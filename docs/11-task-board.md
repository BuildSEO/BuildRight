# 11 · Task Board

> Status: **active planning doc** · Last updated: 2026-06-23
>
> This is the master work breakdown for the SEO Snapshot Tool (codename **BuildRight**). It groups
> every task into ten workstreams plus a cross-cutting Definition of Done. The full phase list
> (Phases 0–12) is now known, so every task is tagged with its **real phase**. Phases 1–2 are built;
> Phases 3–12 are specified by their matching phase files under [`./phases/`](./phases/) and the
> sibling design docs. Capture/API/UI modules below are framed as **design for future phases** — the
> authoritative source for each is its phase file (e.g. [phase-04-capture-extract-core.md](./phases/phase-04-capture-extract-core.md)).
>
> **Related docs:** [Overview](./01-overview.md) · [Tech stack](./02-tech-stack.md) ·
> [Architecture](./03-architecture.md) · [Folder structure](./04-folder-structure.md) ·
> [Conventions](./05-conventions.md) · [Data model](./06-data-model.md) ·
> [Capture pipeline](./07-capture-pipeline.md) · [API & UI](./08-api-and-ui.md) ·
> [Testing & verification](./09-testing-and-verification.md) · [Risks & scaling](./10-risks-and-scaling.md)

---

## How to read this board

- `- [ ]` = not started · `- [x]` = done. Phase 1–2 items below are marked done where the sibling
  docs declare them built.
- **Tag legend:** `Phase 0` = canonical rules (cross-cutting) · `Phase 1` = Foundation & Tooling ·
  `Phase 2` = Data & Storage · `Phase 3` = URL Discovery · `Phase 4` = Capture Engine ·
  `Phase 5` = Compression & Export · `Phase 6` = Worker & Concurrency · `Phase 7` = API Layer ·
  `Phase 8` = UI dashboard + new-scan · `Phase 9` = UI snapshot table · `Phase 10` = UI viewer ·
  `Phase 11` = SEO recovery / compare · `Phase 12` = Hardening.
- Each task names the doc (and section where useful) and, for built phases, the matching phase file.
  Build order is in [§ Dependency order](#dependency-order--definition-of-done).
- **Do not build ahead.** A task is only opened when its phase is. See
  [Conventions §8](./05-conventions.md).

---

## 1. Foundation & Tooling

The repo, the strict toolchain, and the shared `src/lib` primitives every other workstream imports.

- [x] Init Next.js (App Router, TS, Tailwind, ESLint, `src/`, `@/*` alias). — Phase 1, [Conventions §6.1](./05-conventions.md), [phase-01-scaffolding.md](./phases/phase-01-scaffolding.md)
- [x] Init shadcn/ui; add button, table, input, card, badge, dialog, sheet, dropdown-menu, progress, sonner. — Phase 1, [API & UI §5](./08-api-and-ui.md)
- [x] Install runtime deps (`@prisma/client prisma playwright p-queue sharp pdf-lib fast-xml-parser zod @tanstack/react-query`) + `tsx` (dev). — Phase 1
- [x] Install Playwright **Chromium** binary only. — Phase 1, [Testing §10](./09-testing-and-verification.md)
- [x] Create folders `src/lib`, `src/capture`, `src/worker`, `data/archive`. — Phase 1, [Conventions §6.3](./05-conventions.md)
- [x] `src/lib/logger.ts`: `info`/`warn`/`error` → timestamp + level + message + optional meta JSON. — Phase 1, [Conventions §4.1](./05-conventions.md)
- [x] `src/lib/paths.ts`: `DATA_DIR`, `ARCHIVE_DIR`, `snapshotDir(projectId, snapshotId)`, `pageAssetPath(...)`; mkdir-if-missing; **relative** paths stored in DB. — Phase 1, [Data model §7](./06-data-model.md)
- [x] `.gitignore` `data/`, `.env`, `node_modules`, `.next`. — Phase 1, [Conventions §9](./05-conventions.md)
- [x] `package.json` scripts: `dev`, `worker` (`tsx src/worker/index.ts`), `db:push`, `db:studio`. — Phase 1
- [x] Tighten `tsconfig.json` strict floor (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `useUnknownInCatchVariables`, `verbatimModuleSyntax`, …). — Phase 0, [Conventions §1.1](./05-conventions.md)
- [x] ESLint rules: `no-explicit-any`, `no-floating-promises`, `no-unused-vars`, `no-console` scoped to `worker`/`capture`, `eqeqeq`, restrict `process.env`. — Phase 0, [Conventions §10](./05-conventions.md)
- [x] Prettier config + `.prettierignore` (ignore `data/`, `.next/`); scripts `format` / `format:check`. — Phase 0, [Conventions §10](./05-conventions.md)
- [x] `src/lib/types.ts`: shared status literal unions (`SnapshotStatus`, `PageStatus`, `Discovery`). — Phase 0, [Conventions §1.3](./05-conventions.md)
- [x] `src/lib/errors.ts`: `toError(unknown)→Error`, `Result<T>` envelope, stable error `code` constants. — Phase 0, [Conventions §3.1–3.3](./05-conventions.md)
- [x] `src/lib/env.ts`: single zod-validated env loader; nothing else reads `process.env`. — Phase 0, [Conventions §5.2](./05-conventions.md)
- [x] `.env.example` listing every key with placeholders (`DATABASE_URL`, capture knobs added per phase). — Phase 0, [Conventions §5.3](./05-conventions.md)

## 2. Data & Storage

The Prisma schema, the client singleton, JSON-in-string conventions, and the on-disk archive layout.

- [x] `prisma/schema.prisma`: `Project` / `Snapshot` / `Page` models exactly as specified. — Phase 2, [Data model §2](./06-data-model.md), [phase-02-database-layer.md](./phases/phase-02-database-layer.md)
- [x] `Page` indexes: `@@index([snapshotId])` + `@@unique([snapshotId, url])`. — Phase 2, [Data model §6](./06-data-model.md)
- [x] `src/lib/db.ts`: Prisma singleton with hot-reload `globalThis` guard. — Phase 2, [Data model §9](./06-data-model.md)
- [x] `DATABASE_URL="file:./data/app.db"` via `.env`; `npm run db:push` applies schema. — Phase 2, [Data model](./06-data-model.md)
- [x] JSON serialize/parse helper for `headings` / `schema` / `links` (single place, zod-validated on read). — Phase 2, [Data model §5](./06-data-model.md)
- [ ] Confirm archive directory tree (`<projectId>/<snapshotId>/<pageId>.{webp,pdf,html.gz}`) wired through `paths.ts`. — Phase 2, [Data model §7](./06-data-model.md)
- [ ] *(planned)* Postgres-readiness checklist: `String?`→`Json?`, provider swap, enums, migrations. — Phase 12, [Data model §8](./06-data-model.md)

## 3. URL Discovery

`src/capture/discover.ts` + `scripts/test-discover.ts` — sitemap-first, **`fetch` + light HTML parser**
crawl fallback (no Playwright), normalization. Side-effect-free contract.

- [ ] `normalizeUrl()` / `normalizeUrls()` pure functions (host-lowercase, strip ports/fragments/tracking params, dedupe, cap). — Phase 3, [Capture §2.4](./07-capture-pipeline.md), [phase-03-page-discovery.md](./phases/phase-03-page-discovery.md)
- [ ] `findSitemapUrls()`: robots.txt `Sitemap:` directives + conventional `/sitemap.xml`, deduped. — Phase 3, [Capture §2.2](./07-capture-pipeline.md)
- [ ] `parseSitemap()` with `fast-xml-parser`; auto-detect `<urlset>` vs `<sitemapindex>` by root element. — Phase 3, [Capture §2.2](./07-capture-pipeline.md)
- [ ] `collectFromSitemaps()`: BFS nested sitemap-index walk, depth + total-fetch + per-sitemap byte caps, loop-break visited set. — Phase 3, [Capture §2.2](./07-capture-pipeline.md), [Risks R4](./10-risks-and-scaling.md)
- [ ] `crawl()` BFS fallback via **`fetch` + a light HTML link parser** (no Playwright): same-origin only, depth + page caps, skip non-HTML, basic robots respect. — Phase 3, [Capture §2.3](./07-capture-pipeline.md), [Risks R1](./10-risks-and-scaling.md)
- [ ] Fall back sitemap→crawl on zero usable URLs; emit `warnings`, never throw out of `discover()`. — Phase 3, [Capture §2.1–2.2](./07-capture-pipeline.md)
- [ ] SSRF guard: block localhost/loopback/link-local/private IP ranges, http(s)-only, re-check on redirect. — Phase 3, [Risks R11](./10-risks-and-scaling.md)
- [ ] Enforce `maxPages` hard cap (default 200) as a counter; honest truncation warning. — Phase 3, [Risks R1](./10-risks-and-scaling.md)
- [ ] `scripts/test-discover.ts`: manual smoke runner for `discover()` against a URL. — Phase 3, [phase-03-page-discovery.md](./phases/phase-03-page-discovery.md)

## 4. Capture Engine

`src/capture/capture.ts` + `scripts/test-capture.ts` — Playwright navigation, full-page screenshot,
single-`evaluate` SEO extraction. Returns plain data; no DB/disk.

- [ ] `capturePage()` contract: takes worker-owned `BrowserContext`, returns `CaptureResult` (status, PNG, extracted, dims, rawHtml). — Phase 4, [Capture §3.1](./07-capture-pipeline.md), [phase-04-capture-extract-core.md](./phases/phase-04-capture-extract-core.md)
- [ ] Navigation: `goto` with `domcontentloaded` + bounded `networkidle` settle; main-response `httpStatus`. — Phase 4, [Capture §3.2](./07-capture-pipeline.md)
- [ ] Full-page PNG screenshot + scroll-width/height capture. — Phase 4, [Capture §3.3](./07-capture-pipeline.md)
- [ ] Single `page.evaluate` extraction: title, meta description, canonical, robots, headings tree, JSON-LD (skip malformed per-block), links (resolved href + internal flag), word count. — Phase 4, [Capture §3.4](./07-capture-pipeline.md)
- [ ] Author extraction as **pure functions over an HTML string** with a thin DOM wrapper (unit-testable). — Phase 4, [Testing §4.3](./09-testing-and-verification.md)
- [ ] Page-height/dimension cap to prevent OOM; clip + record honest `height` if exceeded. — Phase 4, [Risks R2](./10-risks-and-scaling.md)
- [ ] SPA handling: bounded `networkidle`, optional settle delay, scroll-to-bottom for lazy images. — Phase 4, [Risks R5](./10-risks-and-scaling.md)
- [ ] Honest User-Agent + Accept-Language; record `403/503` block screenshots; no evasion. — Phase 4, [Risks R6](./10-risks-and-scaling.md)
- [ ] Timeout-bounded navigation + redirect-chain cap; per-page try/catch + logged error. — Phase 4, [Risks R12](./10-risks-and-scaling.md)
- [ ] `scripts/test-capture.ts`: manual single-URL capture runner that dumps `CaptureResult`. — Phase 4, [phase-04-capture-extract-core.md](./phases/phase-04-capture-extract-core.md)

## 5. Compression & Export

`src/capture/compress.ts` — `toWebpUnderLimit` (sharp PNG→WebP under 5 MB) and `toPdf` (pdf-lib).
Pure over buffers; no DB/disk.

- [ ] `toWebpUnderLimit()`: bounded quality step-down ladder; return first buffer that fits. — Phase 5, [Capture §4.2](./07-capture-pipeline.md), [phase-05-compression.md](./phases/phase-05-compression.md)
- [ ] Downscale dimensions as last resort; soft-cap fallback (write best-effort + WARN, record real `fileSizeBytes`). — Phase 5, [Capture §4.2](./07-capture-pipeline.md), [Risks R3](./10-risks-and-scaling.md)
- [ ] `toPdf()`: embed image, split tall pages across PDF pages; PDF is optional. — Phase 5, [Capture §4.3](./07-capture-pipeline.md)
- [ ] Append/stream PDF assembly from compressed assets (no all-images-in-memory); size warning above threshold. — Phase 5, [Risks R9](./10-risks-and-scaling.md)
- [ ] Bounded iteration so a pathological input fails clearly instead of looping forever. — Phase 5, [Testing §4.2](./09-testing-and-verification.md)

## 6. Worker & Concurrency

`src/capture/pipeline.ts` + `src/worker/index.ts` — the only modules touching Prisma + filesystem in
the capture path.

- [ ] `captureOnePage()` in `pipeline.ts`: one URL end-to-end, **never rejects**, returns `{status:"done"|"failed"}`. — Phase 6, [Capture §5.1](./07-capture-pipeline.md), [phase-06-worker.md](./phases/phase-06-worker.md)
- [ ] Pipeline steps: mark `capturing` → capture → compress → gzip HTML → write via `paths.ts` → upsert `Page` `done` → atomic `donePages++`. — Phase 6, [Capture §5.2](./07-capture-pipeline.md)
- [ ] `404`/`500` = successful capture (`done`); only artifact-production failures are `failed`. — Phase 6, [Capture §6](./07-capture-pipeline.md)
- [ ] Per-page failure isolation: catch → log → `Page.error` → still increment `donePages`. — Phase 6, [Capture §6](./07-capture-pipeline.md), [Risks R10](./10-risks-and-scaling.md)
- [ ] Worker `main()` loop in `src/worker/index.ts`: launch one Chromium + one `BrowserContext`; install SIGINT/SIGTERM handlers; start poll loop. — Phase 6, [Capture §8.1](./07-capture-pipeline.md)
- [ ] `claimNextSnapshot()`: atomic `updateMany` guard flipping `queued→discovering` (double-claim safe). — Phase 6, [Capture §8.2](./07-capture-pipeline.md)
- [ ] `runSnapshot()`: discover → `createMany` `Page` rows + set `totalPages` → `capturing` → p-queue fan-out → finalize `done`/`failed`. — Phase 6, [Capture §8.2](./07-capture-pipeline.md)
- [ ] p-queue concurrency **3–4** (from `CAPTURE_CONCURRENCY` env, default 3); one snapshot at a time per worker. — Phase 6, [Capture §7.1](./07-capture-pipeline.md), [Risks R2](./10-risks-and-scaling.md)
- [ ] WAL mode + `busy_timeout` pragma at worker DB startup (mitigates `SQLITE_BUSY`). — Phase 6, [Risks R7](./10-risks-and-scaling.md)
- [ ] Resume stuck pages: on (re)claim, reset in-flight `capturing` `Page` rows back to `queued` so they are re-captured. — Phase 6, [Capture §8.3](./07-capture-pipeline.md), [Risks R10](./10-risks-and-scaling.md)
- [ ] Per-page timeout + redirect-chain cap (sitemap 10s, nav 30s, networkidle 5s, per-page 60s). — Phase 6, [Capture §7.2–7.3](./07-capture-pipeline.md)
- [ ] Graceful shutdown: stop claiming, drain or abort in-flight, `browser.close()`, exit; in-flight `capturing` rows resumable. — Phase 6, [Capture §8.3](./07-capture-pipeline.md), [Risks R10](./10-risks-and-scaling.md)

## 7. API Layer

App Router route handlers under `src/app/api` + `src/lib/api.ts`. API only ever writes a `queued`
Snapshot row, reads progress/pages, and streams per-page files — **never runs Playwright**.

- [ ] `src/lib/api.ts`: `ok`/`fail`/`handle` wrapper + `AppError`; ZodError→400, AppError→status, else 500 (logged). — Phase 7, [API & UI §2.2](./08-api-and-ui.md), [phase-07-api-routes.md](./phases/phase-07-api-routes.md)
- [ ] Zod input schemas for projects/snapshots/pages shared by API + forms. — Phase 7, [API & UI §2.3, §7](./08-api-and-ui.md)
- [ ] `POST /api/projects`, `GET /api/projects`, `GET /api/projects/:id`. — Phase 7, [API & UI §3.1](./08-api-and-ui.md)
- [ ] `POST /api/snapshots`: verify project, insert `queued` row only, return `201`. **No Playwright.** — Phase 7, [API & UI §3.2](./08-api-and-ui.md)
- [ ] `GET /api/snapshots/:id`: progress counters, `Cache-Control: no-store` (polled). — Phase 7, [API & UI §3.2](./08-api-and-ui.md)
- [ ] `GET /api/snapshots/:id/pages` (+ `/:pageId`): parsed JSON columns, keyset pagination. — Phase 7, [API & UI §3.2](./08-api-and-ui.md)
- [ ] `GET /api/pages/:id/screenshot`: stream the per-page WebP from `ARCHIVE_DIR` with **path-traversal guard**; correct content-type. — Phase 7, [API & UI §3.4](./08-api-and-ui.md)
- [ ] `GET /api/pages/:id/pdf`: stream the per-page PDF from `ARCHIVE_DIR` with **path-traversal guard**; correct content-type. — Phase 7, [API & UI §3.4](./08-api-and-ui.md)
- [ ] `export const runtime = "nodejs"` on every handler; all inputs zod-validated. — Phase 7, [API & UI §2](./08-api-and-ui.md), [Conventions §5.1](./05-conventions.md)

## 8. UI / Frontend

App Router pages + shadcn/ui components, TanStack Query polling, zod-shared forms. Split across the
dashboard (Phase 8), the snapshot table (Phase 9), and the page viewer (Phase 10).

- [ ] Root layout: `QueryClientProvider` + Sonner `<Toaster />`. — Phase 8, [API & UI §5](./08-api-and-ui.md), [phase-08-frontend-projects-new-scan.md](./phases/phase-08-frontend-projects-new-scan.md)
- [ ] Dashboard + new-scan pages: `/` (projects) and `/projects/:id` + new-project/new-snapshot overlays. — Phase 8, [API & UI §5.1](./08-api-and-ui.md)
- [ ] Components: `ProjectsTable`, `NewProjectDialog`, `NewSnapshotSheet`. — Phase 8, [API & UI §5.2](./08-api-and-ui.md)
- [ ] zod-shared forms (`react-hook-form` + `zodResolver`) reusing API schemas; domain normalization. — Phase 8, [API & UI §5.7](./08-api-and-ui.md)
- [ ] Snapshot table page `/snapshots/:id`: live polling every **2s**, `SnapshotProgress`, `SnapshotStatusBadge`; TanStack Query `refetchInterval` stops at terminal. — Phase 9, [API & UI §5.3](./08-api-and-ui.md), [phase-09-snapshot-table.md](./phases/phase-09-snapshot-table.md)
- [ ] Results grid: `PagesResultsTable` (columns §5.4), `HttpStatusBadge`, `Thumbnail`, **expandable rows**, search/filter, keyset pagination. — Phase 9, [API & UI §5.4](./08-api-and-ui.md)
- [ ] **Export ZIP button (STUB)** with Sonner toasts — UI affordance only, no worker assembly. — Phase 9, [API & UI §5.2](./08-api-and-ui.md)
- [ ] Loading / empty / error / skeleton states per surface; "Is the worker running?" hint on stuck `queued`. — Phase 9, [API & UI §5.3, §5.6](./08-api-and-ui.md)
- [ ] Page viewer `/pages/:id`: `ScreenshotViewer` + `SeoFieldDetail` (headings tree, pretty JSON-LD, links table via per-page fetch). — Phase 10, [API & UI §5.5](./08-api-and-ui.md), [phase-10-screenshot-viewer.md](./phases/phase-10-screenshot-viewer.md)

## 9. SEO Recovery / Compare

Cross-snapshot diffing so a user can recover what changed: a compare endpoint, a compare page, three
reports, and a redirect-map export.

- [ ] `GET /api/snapshots/compare`: take two snapshot ids, diff their `Page` rows, return the three reports. — Phase 11, [API & UI §3.3](./08-api-and-ui.md), [phase-11-seo-recovery.md](./phases/phase-11-seo-recovery.md)
- [ ] `/projects/:id/compare` page: pick two snapshots, render the three reports. — Phase 11, [API & UI §5.5](./08-api-and-ui.md)
- [ ] Three reports: **missing/removed pages**, **changed SEO fields** (title/meta/canonical/robots/h1/wordCount), and **status/HTTP changes**. — Phase 11, [phase-11-seo-recovery.md](./phases/phase-11-seo-recovery.md)
- [ ] **Redirect-map CSV** export of old→new URLs derived from the diff. — Phase 11, [phase-11-seo-recovery.md](./phases/phase-11-seo-recovery.md)

## 10. Hardening

Make the local-first product durable: contention safety, retries, observability, operator actions,
and run/backup docs.

- [ ] WAL mode + `busy_timeout` pragma on **both** the app (`db.ts`) and worker DB startup. — Phase 12, [Risks R7](./10-risks-and-scaling.md), [phase-12-hardening-and-scale.md](./phases/phase-12-hardening-and-scale.md)
- [ ] **Retry-with-backoff ≤2** around `capturePage` in the pipeline for transient nav/browser errors. — Phase 12, [Capture §7.3](./07-capture-pipeline.md), [Risks R12](./10-risks-and-scaling.md)
- [ ] **Per-snapshot capture log** file under the snapshot's archive dir (via `paths.ts`). — Phase 12, [phase-12-hardening-and-scale.md](./phases/phase-12-hardening-and-scale.md)
- [ ] **Re-run-failed-pages** action: reset `failed` `Page` rows to `queued` and re-enqueue the snapshot. — Phase 12, [phase-12-hardening-and-scale.md](./phases/phase-12-hardening-and-scale.md), [Risks R10](./10-risks-and-scaling.md)
- [ ] **Settings constants file** centralizing tunable knobs (timeouts, caps, concurrency, size limits). — Phase 12, [Conventions §5](./05-conventions.md)
- [ ] **`GET /api/health`** + a worker **heartbeat row** (**new Prisma model**) the worker updates each loop. — Phase 12, [Data model §8](./06-data-model.md), [Risks Scaling §5](./10-risks-and-scaling.md)
- [ ] **README run + backup docs**: how to start app + worker, and how to back up `data/`. — Phase 12, [Overview](./01-overview.md), [phase-12-hardening-and-scale.md](./phases/phase-12-hardening-and-scale.md)
- [ ] *(planned)* SQLite→Postgres: provider swap, `Json` columns, enums, `prisma migrate` history. — Phase 12, [Risks Scaling §1](./10-risks-and-scaling.md), [Data model §8](./06-data-model.md)
- [ ] *(planned)* p-queue→BullMQ + Redis: queue/worker swap at `worker/index.ts` construction; retries/backoff/DLQ. — Phase 12, [Risks Scaling §2](./10-risks-and-scaling.md), [Capture §9](./07-capture-pipeline.md)
- [ ] *(planned)* Single→N workers: `ownerId`/`claimedAt` lock column, lease/heartbeat, `SELECT … FOR UPDATE SKIP LOCKED`. — Phase 12, [Risks Scaling §3](./10-risks-and-scaling.md)
- [ ] *(planned)* Disk→S3: storage interface (`put/get/url`), relative paths as object keys, signed URLs. — Phase 12, [Risks Scaling §4](./10-risks-and-scaling.md)
- [ ] *(planned)* Archive retention/prune command + pre-run disk-space check. — Phase 12, [Risks R8](./10-risks-and-scaling.md)

## (cross-cutting) Testing & QA

The offline fixture site, the test pyramid, and the per-phase quality gates. These tasks land
alongside the phase whose code they cover.

- [ ] Fixture site `test/fixtures/site/` (sitemap, sitemap-index, robots, content pages, `orphan.html`, `500.html`). — alongside Phase 3, [Testing §3.1](./09-testing-and-verification.md)
- [ ] `test/fixtures/expected.ts` golden known-answer table; single source of truth for all layers. — alongside Phase 3–4, [Testing §3.2](./09-testing-and-verification.md)
- [ ] Unit: `discover.ts` sitemap/index parsing + `normalizeUrl`/dedupe. — alongside Phase 3, [Testing §4.1](./09-testing-and-verification.md)
- [ ] Unit: `compress.ts` WebP-under-cap loop, bounded iteration, reported dims/size. — alongside Phase 5, [Testing §4.2](./09-testing-and-verification.md)
- [ ] Unit: SEO extractors over fixture HTML, asserted against `expected.ts`. — alongside Phase 4, [Testing §4.3](./09-testing-and-verification.md)
- [ ] Unit: `paths.ts` building + no-traversal + idempotent mkdir. — alongside Phase 2, [Testing §4.4](./09-testing-and-verification.md)
- [ ] Integration: `pipeline.ts` vs local fixture HTTP server (happy + `500.html` isolation + `@@unique` dupe). — alongside Phase 6, [Testing §5.1](./09-testing-and-verification.md)
- [ ] Integration: `db.ts` vs temp SQLite (CRUD, singleton, counters/status transitions). — alongside Phase 2/6, [Testing §5.2](./09-testing-and-verification.md)
- [ ] E2E (Playwright): happy path, failure isolation, crawl-fallback; metadata-only screenshot assertions. — alongside Phase 8–10, [Testing §6](./09-testing-and-verification.md)
- [ ] Test scripts `test:unit` / `test:int` / `test:e2e:smoke` / `verify` added as code lands. — alongside Phase 3+, [Testing §7](./09-testing-and-verification.md)
- [ ] CI workflow `.github/workflows/ci.yml` (cheapest-first: typecheck→lint→unit→int→smoke). — alongside Phase 12, [Testing §10](./09-testing-and-verification.md)
- [ ] Manual verify checklists exercised per subsystem before PR. — every phase, [Testing §8](./09-testing-and-verification.md)
- [ ] Resolve open questions: dimension/downscale defaults, retention policy, PDF chunking, job-claim target DB, ZIP-export assembly. — Phase 12, [Risks Open questions](./10-risks-and-scaling.md), [API & UI §8](./08-api-and-ui.md)

---

## Dependency order & Definition of Done

### Recommended dependency order

1. **Foundation & Tooling (Phase 0–1)** — everything imports `lib`; strict toolchain gates all later work.
2. **Data & Storage (Phase 2)** — the schema is the spine; discovery/capture/API/UI all read or write these rows.
3. **URL Discovery (Phase 3)** — pure, `fetch`-based, no browser; the cheapest capture-path module and the first the worker needs.
4. **Capture Engine (Phase 4)** — depends on Playwright + the extraction pure functions.
5. **Compression & Export (Phase 5)** — consumes capture output buffers; independent of discovery.
6. **Worker & Concurrency (Phase 6)** — orchestrates discovery + capture + compression + DB; needs 3–5.
7. **API Layer (Phase 7)** — writes `queued` rows (needs Data), reads progress/pages, streams per-page files; independent of the worker except via the DB.
8. **UI / Frontend (Phases 8–10)** — consumes the API; dashboard (8) → snapshot table (9) → page viewer (10).
9. **SEO Recovery / Compare (Phase 11)** — diffs two finished snapshots; needs the data + API to exist.
10. **Hardening (Phase 12)** — contention safety, retries, health/heartbeat, run/backup docs; only after the local-first product is proven end-to-end.

> The API (Phase 7) and the capture path (Phases 3–6) are integrated **only at the database**, so they
> can proceed in parallel once Data & Storage lands — exactly the seam the worker split was designed for.

### Cross-cutting / Definition of Done

These apply to **every** task in every workstream (Phase 0 rules + the reusable DoD from
[Testing §11](./09-testing-and-verification.md)).

- [ ] TS strict; no unexplained `any`; small single-responsibility modules; pure logic split from IO. — [Conventions §1–2](./05-conventions.md)
- [ ] Every network/browser/disk op in `try/catch`, logged via `src/lib/logger.ts`; never swallowed; no `console.*` in `worker`/`capture`. — [Conventions §3–4](./05-conventions.md)
- [ ] All API inputs zod-validated; env zod-validated at boot; no secrets in code (`.env` only). — [Conventions §5](./05-conventions.md)
- [ ] Imports via `@/*`; no `../../..` chains; `import type` for type-only imports. — [Conventions §6](./05-conventions.md)
- [ ] New pure logic has unit tests asserting against `test/fixtures/expected.ts` where applicable; new cross-subsystem behavior has an integration test. — [Testing §11](./09-testing-and-verification.md)
- [ ] `npm run typecheck`, `npm run lint`, `npm run format:check`, and the relevant test scope are green before commit. — [Conventions §7, §10](./05-conventions.md), [Testing §7](./09-testing-and-verification.md)
- [ ] Hand-off states **files changed + run command + how to verify** (Phase 0 template). — [Conventions §7](./05-conventions.md)
- [ ] Committed on a branch with a Conventional Commit referencing the phase; `data/`, `.env`, `node_modules`, `.next` never committed. — [Conventions §9](./05-conventions.md)
- [ ] **Only the asked phase was built** — nothing speculative, no future-phase work ahead of its task. — [Conventions §8](./05-conventions.md)
