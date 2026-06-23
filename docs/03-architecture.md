# 03 · Architecture

_Status: planning · last updated 2026-06-23_

## One paragraph

The Next.js app serves the **UI** and a small **API**. When you start a scan, the API writes a
`Snapshot` row (`status = queued`) and returns — it does no heavy work. A **separate worker
process** polls the database for queued snapshots, discovers all page URLs (sitemap first,
crawl fallback), captures each page with Playwright at limited concurrency, compresses the
screenshot to WebP under 5 MB, extracts the SEO fields, gzips the raw HTML, writes files to
disk and metadata to SQLite, and updates progress as it goes. The UI polls for progress and
renders the table. This worker split is the **same shape** used in the cloud (swap
p-queue → BullMQ, SQLite → Postgres, disk → S3), so nothing gets thrown away when scaling.

## Components

```
┌─────────────────────────────────────────────────────────────────┐
│                      Next.js app (one process)                    │
│                                                                   │
│   UI pages (App Router)            API route handlers             │
│   ─ projects / snapshots           ─ POST /api/snapshots → queued │
│   ─ live progress (TanStack        ─ GET  status / pages          │
│     Query polling)                 ─ asset streaming, PDF export  │
│        │           ▲                        │        ▲            │
└────────┼───────────┼────────────────────────┼────────┼───────────┘
         │ poll      │ JSON                    │ write  │ read
         ▼           │                         ▼        │
   (browser)         │                ┌──────────────────────┐
                     └────────────────│   SQLite (app.db)     │
                                      │   Prisma models       │
                                      └──────────────────────┘
                                            ▲   ▲
                                     poll   │   │  write progress
                                            │   │
┌───────────────────────────────────────────┼───┼──────────────────┐
│                    Worker process (src/worker/index.ts)           │
│                                                                   │
│   loop: claim queued Snapshot → discover URLs → capture each      │
│   page through p-queue → compress / extract / gzip → write files  │
│                          │                                        │
│                          ▼                                        │
│              Playwright (Chromium, one browser)                   │
└─────────────────────────────┬─────────────────────────────────────┘
                              │ write files
                              ▼
                    data/archive/<project>/<snapshot>/...
                    (screenshots .webp, raw .html.gz, optional .pdf)
```

Two processes, one database, one disk. The DB is the **only** channel between the API and the
worker — there is no in-process queue, no shared memory, no direct call. That decoupling is
the whole point.

## Why the worker is separate

- **The API stays fast and stateless.** Starting a scan is a single insert; the request
  returns in milliseconds regardless of site size.
- **Heavy work is isolated.** A crashing Playwright run, a memory spike, or a hung page can't
  take down the web server.
- **It mirrors the cloud.** In production the worker becomes one or more BullMQ workers
  pulling from Redis. The pipeline code (`discover` / `capture` / `compress` / `pipeline`)
  does not change — only the *queue* and the *storage targets* change.

## Data flow: starting and running a scan

1. **UI → API**: `POST /api/snapshots { projectId, label?, discovery?, maxPages? }`
   (zod-validated). The API inserts `Snapshot(status="queued")` and returns its id.
2. **Worker loop**: polls for the oldest `queued` snapshot, atomically claims it, sets
   `status="discovering"`.
3. **Discovery**: `discover.ts` resolves URLs (sitemap → crawl fallback), capped at
   `maxPages`. The worker creates a `Page(status="queued")` row per URL and sets `totalPages`.
4. **Capture**: `status="capturing"`. Pages run through `p-queue` at a fixed concurrency.
   Each page: `pipeline.ts` navigates → extracts fields → screenshots → compresses → gzips →
   writes files → updates the `Page` row → increments `Snapshot.donePages`.
5. **Finish**: when the queue drains, `status="done"` (or `"failed"` on a fatal error),
   `finishedAt` set.
6. **UI polling**: TanStack Query polls `GET /api/snapshots/:id` every ~1–2s, renders the
   progress bar from `donePages/totalPages`, and stops polling on `done`/`failed`.

See the status state machines in [Data Model](./06-data-model.md) and the module contracts in
[Capture Pipeline](./07-capture-pipeline.md).

## Process & runtime model

| Concern | Local (now) | Cloud (later) |
| --- | --- | --- |
| Web + API | `next dev` / `next start` | Same, behind a load balancer |
| Worker | `tsx src/worker/index.ts` (one process) | N BullMQ workers |
| Queue | DB polling + p-queue concurrency | Redis + BullMQ |
| Database | SQLite file (WAL mode) | Postgres |
| File storage | `data/archive/` on local disk | S3 / object storage |
| Job claim | `UPDATE ... WHERE status='queued'` (single worker) | Atomic claim / lock column |

## Failure & isolation boundaries

- **Per page**: each page capture is wrapped in try/catch. A failed page sets
  `Page.status="failed"` + `error` and the run continues. One bad URL never kills the snapshot.
- **Per snapshot**: a fatal discovery/setup error sets `Snapshot.status="failed"` + `error`.
- **Worker restart**: the loop is idempotent on `queued` work; a restarted worker resumes
  picking up queued snapshots. (Resuming a half-finished `capturing` run is a documented
  scaling concern — see [Risks & Scaling](./10-risks-and-scaling.md).)
