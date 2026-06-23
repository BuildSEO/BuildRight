# 09 · Testing & Verification

> **Status:** Active planning doc · **Last updated:** 2026-06-23 · **Owner:** Test architecture
>
> This document defines *how we prove BuildRight works* — the test pyramid, the fixture site that makes capture
> deterministic offline, the per-phase quality gates that encode the Phase 0 "run & verify, then commit" philosophy,
> the manual verify checklists, and the CI pipeline. It is a plan, not code: only Phases 1–2 are built today, so
> integration/E2E coverage below is **design** that future phases will implement, not a claim that those tests exist.
>
> **Decision (2026-06-23): this approach is CONFIRMED.** We adopt vitest unit tests for the pure logic, keep the
> `scripts/test-*.ts` manual smoke scripts, add a fixture site + integration tests from Phase 6, and gate commits on
> typecheck + lint + unit. See the testing cadence in [README](./README.md#testing-cadence-when-each-layer-lands).

**Related docs:** [Architecture](./03-architecture.md) · [Data model](./06-data-model.md) · [Capture pipeline](./07-capture-pipeline.md) · [Worker & job loop](./07-capture-pipeline.md)

---

## 1. Goals & non-goals

**Goals**

- Make capture **repeatable offline** — no test ever touches a live client domain. A local fixture site is the only
  network target.
- Keep the feedback loop fast: pure logic is covered by millisecond-level unit tests; the slow Playwright/browser path
  is exercised by a small number of integration/E2E tests.
- Encode the Phase 0 rule *"When a task finishes: state which files changed, the command to run it, and how to verify"*
  as **enforceable quality gates** (typecheck + lint + tests) that must be green before any commit.
- Catch regressions in the data we sell to clients: SEO fields (title, meta, canonical, robots, headings, JSON-LD,
  links, word count) must extract identically run-to-run from identical HTML.

**Non-goals**

- No load/performance testing of the worker at scale (that belongs with the BullMQ/Postgres scale-up, out of scope now).
- No visual-regression diffing of screenshots in CI — pixel output is browser-version-sensitive; we assert on
  *metadata* (file exists, is WebP, under the size cap, has width/height), not pixels.
- No testing of third-party libraries themselves (sharp, Playwright, Prisma). We test *our* glue, not theirs.

---

## 2. The test pyramid

```
                 ┌─────────────────────────────┐
                 │   E2E  (Playwright test)     │  few, slow
                 │  worker + API + fixture site │
                 ├─────────────────────────────┤
                 │   INTEGRATION  (vitest)      │  some
                 │  pipeline ↔ fixture HTTP,    │
                 │  db ↔ temp SQLite            │
                 ├─────────────────────────────┤
                 │   UNIT  (vitest)             │  many, fast
                 │  discover / compress /       │
                 │  extraction / paths — pure   │
                 └─────────────────────────────┘
```

| Layer | Tooling | What it covers | Speed | Network/browser |
| --- | --- | --- | --- | --- |
| **Unit** | `vitest` | Pure functions: sitemap & sitemap-index parsing, URL normalization, WebP size-reduction loop, SEO-field extraction over HTML strings, `paths.ts` path building | ms | none |
| **Integration** | `vitest` | `pipeline.ts` against a local fixture HTTP server; `db.ts` against a temp SQLite file | ~seconds | local HTTP + disk + SQLite |
| **E2E** | `@playwright/test` | Worker + API end-to-end against the fixture site: queue a snapshot, let the worker drain it, assert DB rows + on-disk assets | ~tens of seconds | local Chromium + fixture site |

The design pressure of the architecture is deliberate: because `discover`, `compress`, and the extraction logic are
**pure functions**, the overwhelming majority of behavior is testable at the cheap unit layer with no browser at all.
The browser only matters where it is irreducible (rendering a page, taking a screenshot), and that is a thin slice at
the top of the pyramid.

---

## 3. The fixture site (the keystone)

Everything deterministic flows from one asset: a **tiny static fixture site** checked into the repo at
`test/fixtures/site/`. It is plain HTML served by a throwaway static server (Node `http` + `serve-handler`, or
Playwright's built-in `webServer`). No build step, no JS framework — just bytes on disk so the same input always
produces the same captured output.

### 3.1 Layout

```
test/fixtures/site/
  sitemap.xml              # lists the 4 content pages below (absolute URLs to 127.0.0.1:<port>)
  sitemap-index.xml        # a <sitemapindex> pointing at sitemap.xml (exercises the index branch)
  robots.txt               # Sitemap: line → discover should find it
  index.html               # title, meta description, canonical, 1×H1, JSON-LD Organization, internal+external links
  about.html               # H1+H2+H3 tree, no JSON-LD, has a rel=canonical to itself
  blog/post-1.html         # Article JSON-LD, meta robots = "noindex,follow", known word count
  pricing.html             # multiple JSON-LD blocks, query-string + fragment links (normalization targets)
  orphan.html              # NOT in sitemap — only reachable by crawl (exercises crawl fallback)
  500.html                 # server returns 500 for this path (exercises httpStatus + per-page failure isolation)
```

### 3.2 Known-answer table

Because the bytes are fixed, we can hard-code the *expected* extraction. These golden values live next to the fixtures
as `test/fixtures/expected.ts` and are imported by both unit and integration tests.

| Page | httpStatus | title | metaRobots | H1 | JSON-LD blocks | wordCount | internal links |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `index.html` | 200 | `BuildRight Demo` | (none) | `Welcome` | 1 (`Organization`) | 42 | 3 |
| `about.html` | 200 | `About Us` | (none) | `About` | 0 | 88 | 2 |
| `blog/post-1.html` | 200 | `First Post` | `noindex,follow` | `First Post` | 1 (`Article`) | 311 | 4 |
| `pricing.html` | 200 | `Pricing` | (none) | `Pricing` | 2 | 120 | 5 |
| `orphan.html` | 200 | `Orphan` | (none) | `Orphan` | 0 | 12 | 1 |
| `500.html` | 500 | — | — | — | — | — | — |

> Word counts are fixed by the fixture text; if a fixture is edited, the golden table and `expected.ts` must be updated
> in the same commit. Treat the fixture site as a versioned contract.

### 3.3 Why this shape

- **Sitemap-first + crawl fallback** are both exercised: `orphan.html` is intentionally absent from the sitemap, so a
  crawl-mode discovery test can prove the fallback finds it and a sitemap-mode test can prove it does *not*.
- **URL normalization** has real targets: `pricing.html` links carry `?utm=...` query strings, `#section` fragments,
  trailing slashes, and mixed-case hosts.
- **Per-page error isolation** is provable: `500.html` must end as a single `failed` Page row with `httpStatus = 500`
  while every sibling page in the same snapshot still reaches `done`.

---

## 4. Unit tests (vitest)

All unit tests are pure: HTML/string/number in, value out. No disk, no network, no browser. Files live beside the
modules they cover or under `test/unit/`.

### 4.1 `discover.ts` — sitemap parsing & URL normalization

These are the highest-value pure tests because discovery decides *what* we capture.

- [ ] `parseSitemap()` returns the URL list from a `<urlset>` document (fixture `sitemap.xml`).
- [ ] `parseSitemapIndex()` resolves a `<sitemapindex>` to its child sitemap URLs (fixture `sitemap-index.xml`).
- [ ] Index vs. urlset is auto-detected by root element, not by filename.
- [ ] Malformed XML throws a *clear logged* error (never a silent empty list — see Phase 0 rule on swallowing errors).
- [ ] `normalizeUrl()`:
  - lowercases scheme + host, preserves path case
  - strips fragments (`#...`)
  - strips configured tracking params (e.g. `utm_*`), keeps meaningful query
  - collapses duplicate trailing slashes consistently
  - resolves relative hrefs against the page URL
  - classifies internal vs. external against the project domain
- [ ] De-duplication: two hrefs that normalize to the same URL collapse to one (mirrors the `@@unique([snapshotId,url])`
  DB constraint — see [Data model](./06-data-model.md)).

### 4.2 `compress.ts` — WebP size-reduction loop

`compress` is pure over a buffer in / buffer out (sharp is the only side-effect and is fed an in-memory PNG).

- [ ] Given a large PNG buffer, the loop produces a WebP **under the 5 MB cap**.
- [ ] The loop **steps quality down** (and/or downscales) until under cap, and returns the *first* output that fits.
- [ ] A small input that already fits returns on the first pass without needless re-encoding.
- [ ] A pathological input that cannot reach the cap even at the floor quality returns a clearly logged failure rather
      than looping forever (bounded iteration count).
- [ ] Reported `fileSizeBytes`, `width`, `height` match the actual produced buffer.

### 4.3 SEO extraction — pure functions over HTML

Extraction is authored as **pure functions that take an HTML string** (the DOM-side work in `capture.ts` is a thin
wrapper that hands the page's HTML to these). This is the single most important testability decision: it moves all SEO
logic off the browser and onto the fast unit layer, fed directly by the fixture HTML files.

- [ ] `extractTitle`, `extractMetaDescription`, `extractCanonical`, `extractMetaRobots` — present, absent, and duplicated
      tags all handled deterministically.
- [ ] `extractHeadings` returns the `{h1:[], h2:[], …}` structure; `h1` field is the first H1.
- [ ] `extractJsonLd` returns an array of parsed JSON-LD blocks; handles 0, 1, and many; malformed JSON-LD is skipped
      with a logged warning, not a crash.
- [ ] `extractLinks` returns `[{href, anchor, internal}]` with normalization applied and internal/external classified.
- [ ] `wordCount` matches the golden table values.
- [ ] Every extractor asserted against `test/fixtures/expected.ts` so the fixture is the single source of truth.

### 4.4 `paths.ts` — path building

- [ ] `snapshotDir(projectId, snapshotId)` and `pageAssetPath(...)` build the expected relative + absolute paths.
- [ ] Paths are confined under `ARCHIVE_DIR` — assert no traversal escapes the archive root for adversarial ids.
- [ ] Directory creation is idempotent (calling twice does not throw). *(Filesystem touch is allowed here; point
      `DATA_DIR` at a temp dir via env in the test.)*

---

## 5. Integration tests (vitest)

Integration tests wire two real subsystems together. Still no live internet — only `127.0.0.1`.

### 5.1 `pipeline.ts` against a local fixture HTTP server

`pipeline.ts` orchestrates one page: fetch/render → extract → compress → write assets → update DB. The integration test
boots the fixture site on an ephemeral port, then runs the pipeline against individual fixture URLs.

- [ ] Capturing `index.html` produces a `done` Page row whose extracted fields equal the golden table.
- [ ] A `.webp` is written under `ARCHIVE_DIR`, is a valid WebP, and is under 5 MB; `screenshotPath` is the relative path.
- [ ] Gzipped HTML is written and `htmlGzPath` is set.
- [ ] Capturing `500.html` yields a `failed` Page row with `httpStatus = 500` and a populated `error` — and **does not
      throw out of the pipeline** (per-page isolation).
- [ ] Re-capturing the same URL in the same snapshot is rejected by the `@@unique([snapshotId,url])` constraint and
      handled gracefully (logged, not fatal).

### 5.2 `db.ts` against a temp SQLite file

- [ ] Point `DATABASE_URL` at a temp file (e.g. `file:./.tmp/test-<rand>.db`), run `prisma db push`, exercise CRUD for
      Project / Snapshot / Page.
- [ ] The hot-reload singleton guard returns the *same* client instance on repeated import (dev-mode safety).
- [ ] Counters (`totalPages`, `donePages`) and status transitions (`queued → discovering → capturing → done|failed`)
      persist as written.
- [ ] Temp DB is created in `beforeAll` and deleted in `afterAll`; tests never touch `data/app.db`.

---

## 6. E2E tests (Playwright test)

The top of the pyramid: prove the **worker + API** behave together against the fixture site, with a real Chromium doing
real screenshots. Kept deliberately few — one happy path and one failure-isolation path.

Setup uses Playwright's `webServer` to start (a) the fixture site and (b) the Next.js app, plus a spawned worker process
(`tsx src/worker/index.ts`) pointed at a temp SQLite DB and temp `ARCHIVE_DIR`.

- [ ] **Happy path:** `POST` a snapshot for the fixture domain → API returns a `queued` Snapshot row immediately (the
      API never runs Playwright — see [Architecture](./03-architecture.md)). Poll the status endpoint until `done`.
      Assert: `totalPages` matches the sitemap count, every content page is `done`, each has a `.webp` on disk under the
      cap, and SEO fields match the golden table.
- [ ] **Failure isolation:** a snapshot that includes `500.html` finishes with overall status `done` (or `done` with
      one failed page, per the agreed semantics), exactly one Page is `failed`, and all other pages are `done`. One bad
      URL never poisons the run.
- [ ] **Crawl fallback:** a crawl-mode snapshot discovers `orphan.html`; a sitemap-mode snapshot does not.
- [ ] Polling-based assertions use a bounded timeout and the test tears down the worker + temp DB + temp archive.

> **Screenshot assertions are metadata-only.** We assert the WebP exists, decodes, is under 5 MB, and has plausible
> width/height — never pixel equality. Pixels vary across Chromium builds and would make CI flaky.

---

## 7. Quality gates — Phase 0 "run & verify, then commit"

Phase 0 says every finished task must state how to verify it. We make that mechanical: **a commit is only allowed when
the gate for its phase is green.** The gate is the same three checks everywhere, with the *relevant test scope* growing
as phases land.

| Check | Command | Blocks commit? |
| --- | --- | --- |
| Typecheck (strict) | `npx tsc --noEmit` | Yes |
| Lint | `npm run lint` (ESLint) | Yes |
| Unit tests | `npm run test:unit` (`vitest run`) | Yes |
| Integration tests | `npm run test:int` | Yes (once Phase ≥ capture pipeline exists) |
| Smoke E2E | `npm run test:e2e:smoke` | Yes in CI; optional locally for speed |

Suggested `package.json` scripts (added incrementally as the relevant code lands — do **not** add scripts for code that
does not yet exist):

```jsonc
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "next lint",
    "test:unit": "vitest run test/unit",
    "test:int": "vitest run test/integration",
    "test:e2e:smoke": "playwright test --grep @smoke",
    "verify": "npm run typecheck && npm run lint && npm run test:unit"
  }
}
```

**Per-phase gate progression** (illustrative; future phases define their own slice):

- [ ] **Phase 1 (scaffold):** `tsc --noEmit` clean, `lint` clean, app boots (`npm run dev`), worker boots (`npm run worker`).
- [ ] **Phase 2 (DB):** above + `prisma db push` succeeds, `db.ts` integration test green.
- [ ] **Future capture phases:** above + the unit tests for the module shipped that phase + relevant integration test.
- [ ] **Worker/API phases:** above + smoke E2E green.

The rule of thumb: **a phase may not be marked done until its slice of the pyramid is green and the verify steps in the
phase's own task write-up have been executed.**

---

## 8. Manual verify checklist (per subsystem)

Automated gates do not replace a human running the thing once. Each subsystem gets a short, concrete manual check the
author runs before opening a PR. (Paths assume defaults from `paths.ts`.)

**`logger.ts`**
- [ ] `info` / `warn` / `error` each emit one line with timestamp + level + message; meta serializes as JSON; no
      `console.log` left in worker/capture code (grep for it).

**`paths.ts`**
- [ ] Importing the module creates `data/` and `data/archive/` if missing; re-running does not error.

**`db.ts` / schema**
- [ ] `npm run db:push` applies cleanly to a fresh `data/app.db`; `npm run db:studio` shows all three tables with the
      expected columns and the `@@unique([snapshotId,url])` index.

**`discover.ts`**
- [ ] Point at the fixture `sitemap.xml`: returns the 4 listed URLs, all normalized, no dupes.
- [ ] Point at `sitemap-index.xml`: resolves through to the child sitemap.
- [ ] Crawl mode finds `orphan.html`; sitemap mode does not.

**`capture.ts`**
- [ ] Capture one fixture page by hand: a full-page PNG is produced and the extracted SEO object matches the golden row.

**`compress.ts`**
- [ ] Feed a deliberately huge PNG: output `.webp` is under 5 MB and visually intact; reported size matches the file.

**`pipeline.ts`**
- [ ] Run one page end-to-end: DB row reaches `done`, `.webp` + gzipped HTML on disk at the `paths.ts` locations.

**`worker/index.ts`**
- [ ] Start worker, queue a snapshot via the API, watch logs: status walks `queued → discovering → capturing → done`,
      `donePages` increments per page, `500.html` lands as `failed` without stopping the run.

**API route handlers**
- [ ] `POST` create returns immediately with a `queued` row (confirm via logs that **no Playwright ran in the request**).
- [ ] All inputs rejected with a clear 400 when they fail zod validation.

---

## 9. How the architecture keeps bugs small & local

This is *why* the test strategy is cheap, not just what it is.

- **Phased build (Phase 0 rule "do not build ahead").** Each phase ships a small, verifiable slice with its own green
  gate. A regression is bounded to the phase that introduced it, and `git bisect` over phase-sized commits is trivial.
- **Pure functions everywhere they can be.** `discover`, `compress`, and SEO extraction take data in and return data
  out. A failing assertion points at one function with no browser, network, or DB in the way — the bug is reproduced
  from a string literal, not a flaky environment. This is the difference between "the screenshot looks wrong" and
  "`extractCanonical` returns the wrong tag for duplicate `<link rel=canonical>`."
- **Per-page error isolation.** The pipeline wraps each page's external operations (network, browser, disk) in
  try/catch and records the failure on *that* Page row only. One unreachable or 500-ing URL becomes one `failed` row,
  not a dead snapshot. The fixture `500.html` makes this a *tested* guarantee, not a hope.
- **The API/worker split.** Because the API only writes a `queued` row and the worker owns all Playwright, the
  request path has nothing heavy to break, and the worker can be tested as a standalone process. The two are integrated
  only at the DB, which is itself the easiest thing to point at a temp file.
- **Single source of truth for "correct".** `test/fixtures/expected.ts` is imported by unit, integration, and E2E
  layers. There is one place that says what the right answer is, so the layers cannot disagree.

---

## 10. CI pipeline (GitHub Actions)

A single workflow on push/PR. Fast checks first so failures surface early; the browser steps run last.

```yaml
# .github/workflows/ci.yml
name: ci
on:
  push:
    branches: [main]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    env:
      DATABASE_URL: "file:./data/ci.db"
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright Chromium
        run: npx playwright install --with-deps chromium

      - name: Generate Prisma client + push schema
        run: npx prisma generate && npx prisma db push

      - name: Typecheck
        run: npm run typecheck

      - name: Lint
        run: npm run lint

      - name: Unit tests
        run: npm run test:unit

      - name: Integration tests
        run: npm run test:int

      - name: Smoke E2E
        run: npm run test:e2e:smoke

      - name: Upload Playwright report on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
```

Notes:

- `npx playwright install --with-deps chromium` installs **only Chromium** (the one browser we capture with), keeping CI
  lean.
- Steps are ordered cheapest-first (typecheck → lint → unit → integration → smoke E2E) so a typo fails in seconds.
- CI uses a throwaway `file:./data/ci.db` and a temp archive dir — never committed artifacts.
- Add the integration/E2E steps to CI only once those phases exist; until then the job is typecheck + lint + unit.

---

## 11. Definition of Done (reusable)

Copy this checklist into each phase's task write-up. A task is **not** done until every box is ticked.

- [ ] Code follows Phase 0 rules: TS strict, no unexplained `any`, small single-responsibility modules, pure functions
      where possible.
- [ ] Every external operation (network / browser / disk) is wrapped in try/catch and logs via `src/lib/logger.ts`
      (no `console.log` in worker/capture code).
- [ ] All API inputs validated with zod; no secrets in code (`.env` only).
- [ ] New pure logic has unit tests asserting against `test/fixtures/expected.ts` where applicable.
- [ ] New cross-subsystem behavior has an integration test (fixture HTTP server / temp SQLite).
- [ ] If the worker or API changed, the relevant smoke E2E still passes.
- [ ] `npm run typecheck` clean.
- [ ] `npm run lint` clean.
- [ ] Relevant `vitest` / Playwright tests pass locally and in CI.
- [ ] The task write-up states **which files changed, the command to run it, and how to verify it worked** (Phase 0).
- [ ] Fixtures and the golden `expected.ts` table updated in the same commit if any fixture HTML changed.
- [ ] No future-phase work was built ahead of the current task.
