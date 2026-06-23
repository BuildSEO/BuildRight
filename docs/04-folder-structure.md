# 04 · Folder Structure

_Status: planning · last updated 2026-06-23_

## Target tree

```
seo-snapshot/                 (repo root = /Users/kalrajvirk/BuildRight)
  prisma/
    schema.prisma             # Project / Snapshot / Page models (Phase 2)
  src/
    lib/
      db.ts                   # Prisma client singleton (hot-reload guarded)
      logger.ts               # structured logging: info / warn / error
      paths.ts                # where files live on disk; dir builders
    capture/
      discover.ts             # sitemap + crawl URL discovery        (pure-ish)
      capture.ts              # Playwright capture + in-page extraction
      compress.ts             # sharp WebP + pdf-lib PDF             (pure-ish)
      pipeline.ts             # one-page orchestration
    worker/
      index.ts                # long-running job loop
    app/
      api/                    # Next.js route handlers (no Playwright here)
      (ui pages)              # projects, snapshot detail, viewer
  data/
    app.db                    # SQLite (gitignored)
    archive/                  # screenshots + html + pdf (gitignored)
  docs/                       # this planning set
  .env                        # DATABASE_URL etc. (gitignored)
  package.json
```

## What each location is for

### `prisma/schema.prisma`
The single source of truth for the data model. `provider = "sqlite"`, `url` from
`env("DATABASE_URL")`. See [Data Model](./06-data-model.md).

### `src/lib/` — shared infrastructure (no business logic)
- **`db.ts`** — exports one `PrismaClient`. Guards against Next.js dev hot-reload spawning
  many clients (`globalThis` cache). Imported by API, worker, and pipeline.
- **`logger.ts`** — `info` / `warn` / `error`, each printing `timestamp + level + message +
  optional metadata as JSON`. **All worker/capture code uses this, never `console.log`**
  (Phase 0 rule).
- **`paths.ts`** — exports `DATA_DIR`, `ARCHIVE_DIR`, and helpers
  `snapshotDir(projectId, snapshotId)` and `pageAssetPath(...)` that build paths under
  `data/archive` and create directories if missing. The DB stores **relative** paths; this
  module resolves them to absolute and is the only code that knows the on-disk layout.

### `src/capture/` — the capture subsystem (worker-only)
Single-responsibility modules, written so the logic-heavy ones are unit-testable in
isolation. Contracts in [Capture Pipeline](./07-capture-pipeline.md).
- **`discover.ts`** — sitemap-first URL discovery with a crawl fallback. Pure parsing/
  normalization logic separated from network IO.
- **`capture.ts`** — the only place Playwright is driven; navigates a page, screenshots it,
  and extracts SEO fields via `page.evaluate`.
- **`compress.ts`** — sharp PNG→WebP (under 5 MB) and pdf-lib PDF assembly. Pure transforms
  over buffers.
- **`pipeline.ts`** — orchestrates one page end-to-end (capture → compress → gzip → write →
  DB upsert → progress), with per-page error isolation.

### `src/worker/index.ts` — the job loop
The long-running process. Polls the DB, claims a queued snapshot, runs discovery, then feeds
pages through `p-queue`. Owns the single Playwright browser instance and handles graceful
shutdown.

### `src/app/` — UI + API
- **`api/`** — route handlers. Thin: zod-validate → DB read/write → respond / stream files.
  **Never launches Playwright.**
- **UI pages** — projects list, new-project / new-snapshot forms, snapshot detail with live
  progress, results table, screenshot viewer. See [API & UI](./08-api-and-ui.md).

### `data/` — generated artifacts (gitignored)
- **`app.db`** — the SQLite database.
- **`archive/`** — per-snapshot folders of `.webp` screenshots, gzipped `.html`, and optional
  `.pdf`. Layout owned by `paths.ts`; detailed in [Data Model](./06-data-model.md).

### `.env` — configuration (gitignored)
At minimum `DATABASE_URL="file:./data/app.db"`. No secrets in code (Phase 0 rule).

## .gitignore (Phase 1)

```
data/
.env
node_modules
.next
```

## package.json scripts (Phase 1)

| Script | Command | Purpose |
| --- | --- | --- |
| `dev` | `next dev` | Run the web app + API |
| `worker` | `tsx src/worker/index.ts` | Run the capture worker |
| `db:push` | `prisma db push` | Create/update the SQLite schema |
| `db:studio` | `prisma studio` | Inspect the database in a browser |

## Conventions

- Import alias **`@/*`** → `src/*`.
- Files are small and single-responsibility; co-locate nothing that belongs in `lib`.
- New top-level directories must be added to this doc when introduced.
