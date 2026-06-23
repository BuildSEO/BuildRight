# 02 · Tech Stack

_Status: planning · last updated 2026-06-23_

The stack is **decided** — this doc records each choice and *why*, plus the upgrade path that
each local-first choice unlocks. Do not swap a dependency without updating this file.

## The stack

| Layer | Choice | Why | Scales to |
| --- | --- | --- | --- |
| Framework | **Next.js (App Router) + TypeScript (strict)** | One repo for UI + API; deploys to cloud later unchanged | Same |
| UI | **Tailwind + shadcn/ui** | Matches the table/viewer mockups; copy-paste components we own | Same |
| Data fetching | **TanStack Query** | Polling for live scan progress; caching, retries, query keys | Same |
| Database | **SQLite via Prisma** | File-based, zero setup; Prisma makes the Postgres switch ~one line | **Postgres** |
| Capture | **Playwright (Chromium)** | Reliable full-page screenshots + in-page extraction | Same (or remote browsers) |
| Concurrency | **p-queue** | Throttle parallel captures without Redis | **BullMQ + Redis** |
| Images | **sharp** | PNG → WebP under 5 MB, fast native compression | Same |
| PDF | **pdf-lib** | Embed image into a paginated PDF, pure JS | Same |
| Sitemap / XML | **fast-xml-parser** | Parse sitemaps + nested sitemap-index files | Same |
| Validation | **zod** | Validate all API inputs; infer TS types from schemas | Same |
| Worker runner | **tsx** (dev dep) | Run `src/worker/index.ts` (TypeScript) directly | `tsc` build + node in prod |

## Notes per dependency

- **Next.js App Router** — UI pages and `app/api` route handlers live together. The API
  layer stays thin: it validates input, reads/writes the DB, streams files. No Playwright.
- **shadcn/ui components to install** (Phase 1): `button`, `table`, `input`, `card`,
  `badge`, `dialog`, `sheet`, `dropdown-menu`, `progress`, `sonner` (toasts). These cover the
  forms, results table, screenshot viewer, progress bar, and notifications.
- **Prisma + SQLite** — `DATABASE_URL="file:./data/app.db"`. SQLite has no native array type,
  so `headings` / `schema` / `links` are stored as JSON strings; on Postgres they become
  native `Json` columns (see [Data Model](./06-data-model.md)).
- **Playwright** — only Chromium is needed. The browser binary is installed in Phase 1
  (`npx playwright install chromium`; on some systems also `install-deps`). Only the **worker**
  ever launches a browser.
- **p-queue** — bounds how many pages capture at once so we don't exhaust memory. The
  concurrency limit is the single knob; swapping to BullMQ later changes the queue, not the
  pipeline (see [Capture Pipeline](./07-capture-pipeline.md)).
- **sharp** — converts the PNG screenshot to WebP, stepping quality (and finally dimensions)
  down until the file is under 5 MB.
- **pdf-lib** — used for the optional per-page PDF and the combined export.
- **fast-xml-parser** — robust against nested `<sitemapindex>` files and large sitemaps.
- **zod** — validates every API request body/params; also recommended for a typed `.env`
  loader (see [Conventions](./05-conventions.md)).

## Runtime & dev dependencies (target)

```
# runtime
@prisma/client prisma playwright p-queue sharp pdf-lib fast-xml-parser zod @tanstack/react-query

# dev
tsx
# (Next.js, TypeScript, Tailwind, ESLint installed by create-next-app; shadcn CLI adds its peers)
```

## Versions

Pin exact versions in `package.json` once Phase 1 installs them, and record any version that
required a workaround here so the next person isn't surprised. Node **22.x** is the target
runtime (verified locally: v22.23.0).
