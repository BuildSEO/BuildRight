# 08 · API & UI

> **Status:** Design / planned (FUTURE phases). _Last updated 2026-06-23._
>
> This document specifies the HTTP API (App Router route handlers under `src/app/api`) and the
> browser UI (App Router pages + the installed shadcn/ui components) for the SEO Snapshot Tool.
> Phases 1–2 (scaffolding + database) are built; everything described here is **planned** and will
> be implemented in later phases (7–12). Nothing here builds ahead of an assigned task — it is the
> contract those phases will code against, and **the authoritative source for each surface is its
> matching phase file** under `./phases/`.
>
> Phase map for this doc: API route handlers = Phase 7; frontend foundation + dashboard +
> project page = Phase 8; live snapshot table view = Phase 9; screenshot/page viewer = Phase 10;
> compare API + page = Phase 11; health/heartbeat, re-run-failed, capture log, settings constants =
> Phase 12.
>
> Related docs: [Architecture](./03-architecture.md) · [Data model](./06-data-model.md) ·
> [Capture pipeline](./07-capture-pipeline.md) · [Conventions](./05-conventions.md) ·
> [Testing & verification](./09-testing-and-verification.md) ·
> [Risks & scaling](./10-risks-and-scaling.md) · [Task board](./11-task-board.md)

---

## 1. Guiding principles

These follow directly from the project architecture and the Phase 0 coding rules.

- **The API NEVER runs Playwright.** A write endpoint (e.g. `POST /api/projects/[id]/snapshots`)
  only inserts a `Snapshot` row with `status="queued"` and returns immediately. The separate worker
  process (`src/worker/index.ts`) polls the DB, claims queued work, and does all browser/disk work.
  The API surface is therefore thin, fast, and never blocks on a headless browser. See
  [Capture pipeline](./07-capture-pipeline.md).
- **All inputs validated with zod.** Every handler parses its input (JSON body, query string, route
  params) through a zod schema before touching the database. Invalid input → `400` with a
  structured error envelope (see §4).
- **Consistent envelopes.** Success and error responses share predictable shapes so the UI's
  TanStack Query layer has one parsing path.
- **Cloud-ready shape.** Routes, envelopes, and the polling model are designed so the only swaps
  when scaling are infrastructure (p-queue→BullMQ, SQLite→Postgres, disk→S3). The HTTP contract
  does not change. See [Risks & scaling](./10-risks-and-scaling.md).
- **Asset paths come from the DB, never the client.** The screenshot/PDF routes look up the stored
  relative path **by page id** and resolve it inside `ARCHIVE_DIR`. There is no generic
  catch-all asset route and the client never supplies a filesystem path (see §3.4).
- **No secrets in code / structured logging.** Handlers log via `src/lib/logger.ts`, never
  `console.log`; config comes from `.env` and the Phase 12 settings constants file (§3.7).

---

## 2. Conventions shared by all routes

| Concern | Convention |
| --- | --- |
| Runtime | `export const runtime = "nodejs"` on every handler (Prisma + `fs` streaming require Node, not Edge). |
| Content type | JSON in / JSON out, except asset routes which stream binary. |
| IDs | `cuid()` strings (matches Prisma schema). Treated as opaque. |
| Timestamps | ISO-8601 UTC strings in JSON (Prisma `DateTime` serialized via `.toISOString()`). |
| Validation | `zod` schemas colocated in `src/lib/validation/*.ts`, imported by handlers and reused by forms. |
| Errors | Single envelope (see §4); thrown through a shared `handle()` wrapper. Missing ids → clean `404`. |
| Caching | Mutations and live-progress reads send `Cache-Control: no-store`. |
| Typed client | All frontend fetches go through `src/lib/api.ts` typed fetch helpers (§5.2). |

### 2.1 Shared response envelopes

```ts
// success
type Ok<T> = { ok: true; data: T };
// error
type Err = {
  ok: false;
  error: {
    code: string;        // machine-readable, e.g. "VALIDATION_ERROR", "NOT_FOUND"
    message: string;     // human-readable, safe to surface in a toast
    details?: unknown;    // e.g. zod flatten() for field-level form errors
  };
};
```

### 2.2 Handler wrapper pattern

```ts
// src/lib/api/handle.ts (planned)
export function ok<T>(data: T, init?: ResponseInit) {
  return Response.json({ ok: true, data } satisfies Ok<T>, { status: 200, ...init });
}

export function fail(code: string, message: string, status: number, details?: unknown) {
  return Response.json({ ok: false, error: { code, message, details } } satisfies Err, { status });
}

// Wrap a handler so any thrown ZodError → 400, AppError → its status, anything else → 500 (logged).
export function handle(fn: (req: Request, ctx: any) => Promise<Response>) {
  return async (req: Request, ctx: any) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof ZodError)   return fail("VALIDATION_ERROR", "Invalid input", 400, e.flatten());
      if (e instanceof AppError)   return fail(e.code, e.message, e.status);
      logger.error("Unhandled API error", { err: String(e) });   // never console.log
      return fail("INTERNAL", "Something went wrong", 500);
    }
  };
}
```

### 2.3 zod validation pattern

```ts
// example: src/lib/validation/snapshots.ts (planned)
export const createSnapshotInput = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  discovery: z.enum(["sitemap", "crawl"]).default("sitemap"),
  maxPages: z.number().int().min(1).max(1000).default(200),
});
export type CreateSnapshotInput = z.infer<typeof createSnapshotInput>;

// in the handler (projectId comes from the route param, NOT the body):
const body = createSnapshotInput.parse(await req.json()); // throws ZodError → handled by handle()
```

The **same schema** powers the API guard and the client-side form (`react-hook-form` + `zodResolver`),
so the browser shows field errors before the request and the server re-validates defensively.

---

## 3. API inventory

All paths are relative to the app origin. `queued` is the only status the API ever writes for new
snapshots — the worker advances it (`discovering → capturing → done|failed`). Snapshot creation is
**nested under the project** (`POST /api/projects/[id]/snapshots`) and binary assets are served by
**per-page** routes that resolve the path from the DB by page id.

### 3.1 Projects (Phase 7)

#### `POST /api/projects`
Create a project.

- **Input (JSON body):**
  ```ts
  z.object({
    name:   z.string().trim().min(1).max(120),
    domain: z.string().trim().min(1).transform(normalizeDomain), // strips scheme, lowercases host
  })
  ```
- **Behavior:** insert `Project`. (No network — does not fetch the domain.)
- **Response `200`:** `Ok<Project>` → `{ id, name, domain, createdAt }`.
- **Errors:** `400 VALIDATION_ERROR`.

#### `GET /api/projects`
List projects, newest first, each with a lightweight snapshot count and last-capture date (for the
dashboard cards).

- **Response `200`:** `Ok<Array<Project & { snapshotCount: number; lastSnapshotAt: string | null }>>`.

> Authoritative source: [`./phases/phase-07-api-routes.md`](./phases/phase-07-api-routes.md).

### 3.2 Snapshots (Phase 7)

#### `POST /api/projects/[id]/snapshots`  ← the key "enqueue" endpoint
Create a queued snapshot for the project named in the route. **Writes a row only; runs no Playwright.**

- **Input (JSON body):** `createSnapshotInput` (see §2.3) — `{ label?, discovery?, maxPages? }`.
  The `projectId` is the `[id]` route param, not part of the body.
- **Behavior:**
  1. Verify the `Project` exists (`404` if not).
  2. Insert `Snapshot { projectId, status: "queued", discovery, maxPages, totalPages: 0, donePages: 0 }`.
  3. Return immediately. The worker's next poll picks it up.
- **Response `200`:** `Ok<Snapshot>` including `status: "queued"` (the UI navigates to its page).
- **Errors:** `400 VALIDATION_ERROR`, `404 NOT_FOUND` (unknown project).

#### `GET /api/snapshots/[id]`  ← polled for live progress
Status + progress counters. This is the endpoint the snapshot-detail page polls every **2s** while
the snapshot is in flight.

- **Response `200`:** `Ok<{`
  `id, projectId, label, status, discovery, maxPages, totalPages, donePages, error, createdAt, finishedAt }>`.
- **Headers:** `Cache-Control: no-store`.
- **Notes:** `donePages/totalPages` drive the `<Progress>` bar. While `status="queued"` (worker
  hasn't claimed it yet) `totalPages` is `0` and the UI shows a "Queued — waiting for worker" state.
- **Errors:** `404 NOT_FOUND`.

#### `GET /api/snapshots/[id]/pages`  ← results table data
The captured pages, as a lightweight **summary** list for the table.

- **Input (query):**
  ```ts
  z.object({
    search: z.string().trim().optional(),     // server-side filter on URL/title
    cursor: z.string().cuid().optional(),     // keyset pagination
    take:   z.coerce.number().int().min(1).max(200).default(100),
  })
  ```
- **Behavior:** select `Page` rows for the snapshot, filtered server-side by `?search=` (URL/title).
  Heavy JSON columns (`schema`, `links`, full `headings`) are **omitted** from the list payload and
  fetched per-page on demand (see §3.3) to keep the table light.
- **Response `200`:** `Ok<{ pages: PageSummary[]; nextCursor: string | null }>` where:
  ```ts
  type PageSummary = {
    id: string; url: string; status: string;
    httpStatus: number | null; title: string | null;
    screenshotPath: string | null;            // used only to know a thumbnail exists
    capturedAt: string | null;
  };
  ```
- **Errors:** `404 NOT_FOUND` (unknown snapshot).

#### `GET /api/pages/[id]`  ← full page detail
Full single-page record for the expand panel and the viewer. JSON-string columns are **parsed**
before returning.

- **Behavior:** `JSON.parse` the stored `headings`, `schema`, and `links` strings into real
  structures so the client never re-parses.
- **Response `200`:** `Ok<PageDetail>`:
  ```ts
  type PageDetail = {
    id: string; snapshotId: string; url: string; status: string;
    httpStatus: number | null; title: string | null; metaDescription: string | null;
    canonical: string | null; metaRobots: string | null; h1: string | null;
    headings: Record<string, string[]>;                       // parsed (h1..h6)
    schema: unknown[];                                        // parsed JSON-LD blocks
    links: { href: string; anchor: string; internal: boolean }[]; // parsed
    wordCount: number | null;
    width: number | null; height: number | null; fileSizeBytes: number | null;
    screenshotPath: string | null; pdfPath: string | null; htmlGzPath: string | null;
    error: string | null; capturedAt: string | null;
  };
  ```
- **Errors:** `404 NOT_FOUND`.

> Authoritative source: [`./phases/phase-07-api-routes.md`](./phases/phase-07-api-routes.md).

### 3.3 Per-page asset serving (Phase 7)

Binary assets are served by **per-page routes** that read the stored relative path from the DB by
page id and resolve it inside `ARCHIVE_DIR`. **The client never passes a filesystem path** — there
is no `/api/assets/[...path]` catch-all.

#### `GET /api/pages/[id]/screenshot`
Stream the page's `.webp` screenshot.

- **Behavior:**
  1. Look up the `Page` by `[id]` → read `screenshotPath` (a **relative** path stored in the DB).
     `404` if the page or the path is missing.
  2. Resolve the path inside `ARCHIVE_DIR` (via `src/lib/paths.ts`) with a **path-traversal guard**:
     ```ts
     const ARCHIVE_DIR = paths.ARCHIVE_DIR;
     const abs = path.resolve(ARCHIVE_DIR, page.screenshotPath); // relative path FROM THE DB
     const root = path.resolve(ARCHIVE_DIR) + path.sep;
     if (!abs.startsWith(root)) throw new AppError("FORBIDDEN", "Bad asset path", 403);
     ```
  3. Stream the file with `Content-Type: image/webp`, `Content-Length`, and
     `Cache-Control: private, max-age=86400, immutable`. Stream via a Node `ReadStream` → `Response`
     body; do not buffer the whole file.
- **Notes:** even though the path comes from the DB, the route still validates independently — the
  DB is not a trust boundary. Never echo absolute or parent paths in errors or logs.
- **Errors:** `403 FORBIDDEN` (resolved path escapes `ARCHIVE_DIR`), `404 NOT_FOUND` (no page / no
  file on disk).

#### `GET /api/pages/[id]/pdf`
Stream the page's `.pdf` if one exists. Same DB-lookup + traversal-guard pattern as the screenshot
route, with `Content-Type: application/pdf`. `404` if `pdfPath` is null or the file is absent.

> When this moves to S3, only these two routes change (to a redirect / signed URL). The HTTP
> contract for the UI does not. See [Capture pipeline](./07-capture-pipeline.md) for where the
> worker writes these files and [Risks & scaling](./10-risks-and-scaling.md) for the storage swap.

### 3.4 Compare (Phase 11)

#### `GET /api/snapshots/compare?from=A&to=B`
Compare two snapshots **of the same project** by URL, producing three reports.

- **Input (query):**
  ```ts
  z.object({ from: z.string().cuid(), to: z.string().cuid() })
  ```
- **Behavior:** join the two snapshots' `Page` rows by `url` and compute:
  1. **Disappeared** — URLs present in `A` but missing in `B`, or now `4xx`/`5xx` in `B`.
  2. **Changed** — for URLs in both, diffs of `title`, `h1`, `metaRobots`, `canonical`, plus counts
     of **removed internal links** and **removed schema types**.
  3. **Redirect suggestions** — for each disappeared URL, the closest surviving URL in `B` by
     title/H1 **token-overlap similarity**, emitted as a CSV-ready `old → new` mapping.
- **Response `200`:** `Ok<{ disappeared: …[]; changed: …[]; redirects: { from: string; to: string; score: number }[] }>`.
- **Errors:** `400 VALIDATION_ERROR`, `404 NOT_FOUND` (either snapshot), `409 CONFLICT` (snapshots
  belong to different projects).

> Authoritative source: [`./phases/phase-11-seo-recovery.md`](./phases/phase-11-seo-recovery.md).

### 3.5 Health, heartbeat & recovery (Phase 12)

#### `GET /api/health`
Liveness probe + worker heartbeat status, so the UI can warn when the worker isn't running.

- **Behavior:** reads the **worker heartbeat row** (a NEW model added in Phase 12 — _not_ in the
  Phase 2 schema). Reports the API as up and whether a heartbeat has been seen within the last 30s.
- **Response `200`:** `Ok<{ api: "ok"; worker: { alive: boolean; lastBeatAt: string | null } }>`.

#### `POST /api/snapshots/[id]/rerun-failed`
Re-queue **only the failed pages** of a snapshot.

- **Behavior:** set the snapshot's `failed` `Page` rows back to `status="queued"`, clear their
  `error`, and move the snapshot back into a capturing-eligible state so the worker picks them up.
  Pages that already succeeded are untouched.
- **Response `200`:** `Ok<{ requeued: number }>`.
- **Errors:** `404 NOT_FOUND`.

#### Capture log
Per-snapshot capture log surfaced from the existing page-level `error` fields (which pages failed
and why) — see `GET /api/snapshots/[id]/pages` plus `GET /api/pages/[id]` for the detail, and the
Phase 12 UI in §5.

> Authoritative source: [`./phases/phase-12-hardening-and-scale.md`](./phases/phase-12-hardening-and-scale.md).

### 3.6 Export (stubbed in Phase 9)

There is **no `POST /api/snapshots/[id]/export`** and **no worker-assembled combined PDF**. Export
is a **ZIP download button** that is **stubbed in Phase 9** (the button exists and is wired, but the
ZIP-assembly implementation is deferred). When implemented it will be a direct ZIP download of the
snapshot's stored assets; until then the button is present but inert. Do not design an enqueue
endpoint for it.

### 3.7 Settings constants (Phase 12)

A single settings constant file (e.g. `src/lib/settings.ts`) centralizes capture/runtime tunables so
they are not scattered: **concurrency, viewport, deviceScaleFactor, maxPages default (200), size
limit, height cap, and the cookie-banner selector list.** The API and worker both import from it;
the worker is the primary consumer (see [Capture pipeline](./07-capture-pipeline.md)).

### 3.8 Route summary table

| Phase | Method | Path | Input (zod) | Success | Notes |
| --- | --- | --- | --- | --- | --- |
| 7 | POST | `/api/projects` | `{ name, domain }` | `200 Ok<Project>` | No network. |
| 7 | GET | `/api/projects` | — | `200 Ok<Project[]+counts>` | Cards: count + last capture date. |
| 7 | POST | `/api/projects/[id]/snapshots` | `{ label?, discovery?, maxPages? }` | `200 Ok<Snapshot>` | **Writes `queued` only; no Playwright.** `projectId` from route. |
| 7 | GET | `/api/snapshots/[id]` | — | `200 Ok<SnapshotProgress>` | **Polled every 2s**; `no-store`. |
| 7 | GET | `/api/snapshots/[id]/pages` | `{ search?, cursor?, take? }` | `200 Ok<{pages, nextCursor}>` | Summary list; server-side `?search=`. |
| 7 | GET | `/api/pages/[id]` | — | `200 Ok<PageDetail>` | Parsed headings/schema/links. |
| 7 | GET | `/api/pages/[id]/screenshot` | — | `200` `image/webp` stream | Path from DB by id; **traversal guard**. |
| 7 | GET | `/api/pages/[id]/pdf` | — | `200` `application/pdf` stream | Path from DB by id; `404` if no PDF. |
| 11 | GET | `/api/snapshots/compare` | `{ from, to }` | `200 Ok<CompareReport>` | Disappeared / Changed / Redirects. |
| 12 | GET | `/api/health` | — | `200 Ok<HealthStatus>` | Worker heartbeat (30s window). |
| 12 | POST | `/api/snapshots/[id]/rerun-failed` | — | `200 Ok<{requeued}>` | Re-queues only failed pages. |

---

## 4. Error envelope & status codes

| Code | HTTP | When |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | zod parse failed. `details` = `error.flatten()`. |
| `NOT_FOUND` | 404 | Unknown project / snapshot / page, or a missing asset file. |
| `FORBIDDEN` | 403 | Resolved asset path escapes `ARCHIVE_DIR`. |
| `CONFLICT` | 409 | Action illegal for current state (e.g. comparing snapshots from different projects). |
| `INTERNAL` | 500 | Unhandled error (logged, generic message to client). |

All errors share the §2.1 `Err` shape. The UI maps `error.message` straight to a `sonner` toast and,
for forms, maps `error.details` to per-field messages.

---

## 5. UI design (App Router pages + shadcn/ui)

Clean, flat shadcn styling. TanStack Query handles **all** server state with loading/error states and
success/failure toasts; a top-level `QueryClientProvider` + Sonner `<Toaster />` live in the root
layout (Phase 8 frontend foundation).

### 5.1 Route inventory (pages)

| Phase | Route | Purpose | Key data | Components |
| --- | --- | --- | --- | --- |
| 8 | `/` | Dashboard: projects as cards | `GET /api/projects` | `card`, `button`, `NewProjectDialog` |
| 8 | `/projects/[id]` | Project's snapshots | `GET /api/projects` + snapshots | `table`/`card`, `badge`, `button`, `NewSnapshotDialog` |
| 9 | `/snapshots/[id]` | **Live snapshot table** | `GET /api/snapshots/[id]` (polled 2s), `GET …/pages` | `progress`, `badge`, `table`, `sheet`, `button`, `sonner` |
| 10 | `/pages/[id]` | Screenshot / page viewer | `GET /api/pages/[id]` (+ asset routes) | `button`, full-width image frame, detail panel |
| 11 | `/projects/[id]/compare` | Compare two snapshots | `GET /api/snapshots/compare` | two pickers, three result `table`s, CSV download button |

New-project and new-snapshot are **dialogs** launched from the dashboard / project page.

### 5.2 Component inventory

| Component | Role | Notes |
| --- | --- | --- |
| `src/lib/api.ts` | Typed fetch helpers | One helper per route; unwraps the `Ok`/`Err` envelope; used by every TanStack Query/mutation. |
| `ProjectCard` | Dashboard card | name, domain, snapshot count, last capture date |
| `NewProjectDialog` | Create-project form | fields: name, domain → `POST /api/projects` |
| `NewSnapshotDialog` | Enqueue form | fields: label, discovery select (sitemap/crawl), maxPages → `POST /api/projects/[id]/snapshots`; on success navigate to `/snapshots/[id]` |
| `SnapshotHeader` | Domain + label + live progress | `<Progress value={donePages/totalPages*100}>`, status badge |
| `HttpStatusBadge` | Colors HTTP status | 2xx green · 3xx amber · 4xx/5xx red · null neutral |
| `Thumbnail` | Small WebP preview | `<img>` to `/api/pages/[id]/screenshot`; click → `/pages/[id]` |
| `PageRow` | Results table row | thumbnail, URL + title, status badge, captured time, expand chevron |
| `PageExpandPanel` | Inline row detail | Title, H1, Schema as tags, Links (count + first several, "view all" opens a `sheet`); fetches `GET /api/pages/[id]` **lazily on first expand** |
| `PageViewer` | `/pages/[id]` screenshot viewer | full-width WebP frame + full extracted-data panel (§5.5) |
| `ExportZipButton` | ZIP download (Phase 9) | **STUBBED** — present but implementation deferred (§3.6) |
| `CompareView` | Phase 11 page | two pickers + three report tables + redirect-map CSV download |
| `CaptureLog` | Phase 12 panel | failed pages + why; "re-run failed pages" action → `POST …/rerun-failed` |
| `WorkerWarning` | Phase 12 banner | "worker not running" when no heartbeat in 30s (from `GET /api/health`) |
| `EmptyState` / `ErrorState` / `TableSkeleton` | Non-happy states | §5.6 |

### 5.3 Live progress via TanStack Query polling

This is where the worker split surfaces in UX. The page enqueues a snapshot, then **watches the DB
through the API** while a separate process does the real work.

**Polling strategy (`refetchInterval`):** the progress query polls every **2s while** the snapshot
is `discovering` or `capturing`, and **stops** at terminal (`done`/`failed`).

```ts
const { data } = useQuery({
  queryKey: ["snapshots", id],
  queryFn: () => api.getSnapshot(id),
  refetchInterval: (q) => {
    const s = q.state.data?.status;
    return s === "done" || s === "failed" ? false : 2000; // poll every 2s, then stop
  },
  refetchIntervalInBackground: false,
});
```

- **Pages query** refetches on the same cadence **only while** the snapshot is
  `discovering`/`capturing`, so newly captured rows stream into the table; it **stops** once
  `done`/`failed`. Do **not** fetch all page detail upfront — the table uses the lightweight summary
  list, and full `GET /api/pages/[id]` is fetched lazily only when a row is expanded (§5.4).
- **On enqueue:** the create-snapshot mutation's `onSuccess` navigates to `/snapshots/[id]`, where
  the page lands on a populated "Queued" view.
- **Terminal handling:** when status flips to `done`, a one-shot success toast fires and a final
  pages refetch runs; `failed` surfaces the `Snapshot.error` string in an `ErrorState` + error toast.

**How the worker split shows in UX (state choreography):**

| `status` | What the user sees |
| --- | --- |
| `queued` | "Queued — waiting for the capture worker." Indeterminate progress; `totalPages` still `0`. Proves the API returned without doing work. |
| `discovering` | "Discovering pages (sitemap/crawl)…"; `totalPages` ticks up as URLs are found. |
| `capturing` | `<Progress>` = `donePages/totalPages`; the table fills in live, row by row, as the worker captures + extracts each page. |
| `done` | Green badge, full table, export button enabled, success toast. `finishedAt` shown. |
| `failed` | Red badge, `error` surfaced, partial results still viewable; Phase 12 adds "re-run failed pages". |

> In Phase 12 a **"worker not running" banner** (`WorkerWarning`) makes the two-process design
> visible when `GET /api/health` reports no heartbeat in 30s — instead of leaving a snapshot stuck
> in `queued` with no explanation.

### 5.4 Results table (`/snapshots/[id]`, Phase 9)

Header: domain, label, and a **live progress bar** (`donePages/totalPages`, shadcn `progress`).

The shadcn `table` columns, in order:

1. **Thumbnail** — small WebP via `/api/pages/[id]/screenshot`; click → `/pages/[id]` viewer.
2. **URL + Title** — truncated; full URL on hover.
3. **HTTP status** — `HttpStatusBadge` (green 2xx / amber 3xx / red 4xx–5xx).
4. **Captured time** — `capturedAt`.
5. **Expand chevron** — toggles the inline `PageExpandPanel`.

**Row expand → inline panel:** Title, H1, Schema (as tags), Links (count + first several, with a
"view all" that opens a `sheet`). The full `GET /api/pages/[id]` is fetched **lazily on first
expand**, not upfront.

**Search box** filters by URL/title **server-side** via `?search=` on `GET /api/snapshots/[id]/pages`.

**Export** is a ZIP-download `button` — **stubbed for now** (§3.6).

Per-row status: `capturing` rows render a subtle skeleton/spinner; `failed` rows show the page-level
`error` with a warning icon.

### 5.5 Page viewer (`/pages/[id]`, Phase 10)

Fetches `GET /api/pages/[id]`.

- **Top bar:** back button, the URL, **format buttons** (WebP active; PDF shown only if a PDF exists;
  PNG optional), and a **Download** button hitting the right asset endpoint
  (`/api/pages/[id]/screenshot` or `/api/pages/[id]/pdf`).
- **Metadata row:** dimensions (`width`×`height`), file size (`fileSizeBytes`), captured time,
  HTTP status.
- **Main area:** the **full-page WebP at full width** in a bordered frame that **scrolls naturally**
  (no nested scroll box).
- **Side/below panel — full extracted data:** all headings `h1`–`h6`, canonical, meta robots, meta
  description, schema blocks as **pretty-printed JSON**, and the **full links list** (anchor + href +
  internal/external).

### 5.6 Loading / empty / error / skeleton states

| Surface | Loading | Empty | Error |
| --- | --- | --- | --- |
| Dashboard | card skeletons | "No projects yet — create one" + CTA | `ErrorState` + retry |
| Project page | skeleton | "No snapshots yet — run the first capture" | `ErrorState` |
| Snapshot table | progress placeholder + `TableSkeleton` | (rare) "No pages captured" | `failed` → `error` string + toast |
| Results rows | per-row skeleton while `capturing` | filtered-to-empty message | inline row error icons |
| Page viewer | image skeleton / blur-up | broken-asset placeholder | "Asset not found" |
| Compare (P11) | skeleton | "Pick two snapshots" | `ErrorState` |

All mutations (create project, create snapshot, re-run failed) use Sonner toasts driven by the
response envelope.

### 5.7 Forms (zod-shared)

- **New project:** `{ name, domain }`, validated client-side with the same `createProjectInput`
  schema the API uses; server re-validates. Domain normalized (scheme stripped, lowercased).
- **New snapshot:** `{ label?, discovery: sitemap|crawl, maxPages: 1–1000 default 200 }` via
  `createSnapshotInput`. On submit → `POST /api/projects/[id]/snapshots` → navigate to
  `/snapshots/[id]`.

---

## 6. Data flow (end-to-end, enqueue → live → done)

```
[New Snapshot dialog]
   └─ POST /api/projects/[id]/snapshots  (zod validate → insert Snapshot status=queued → 200)  ← API does NO Playwright
        └─ UI navigates to /snapshots/[id]
[/snapshots/[id]]
   └─ useQuery(["snapshots", id]) polls GET /api/snapshots/[id] every 2s WHILE discovering|capturing
        ├─ worker (separate process) claims row → discovering → capturing → done
        └─ pages query polls GET …/pages while in flight → table fills live (summary rows)
   └─ row expand → GET /api/pages/[id] (lazy, first expand) → headings/schema/links
   └─ status=done → stop polling, success toast; Export ZIP button (STUB)
[Thumbnail / viewer] → GET /api/pages/[id]/screenshot | /pdf  (path read from DB by id, traversal-guarded)
[Compare]  GET /api/snapshots/compare?from=A&to=B → three reports + redirect-map CSV
[Health]   GET /api/health → worker heartbeat; "worker not running" banner if none in 30s
```

---

## 7. Build checklist (for the future API/UI phases)

- [ ] (P7) `src/lib/api/handle.ts` — `ok`/`fail`/`handle` wrapper + `AppError`.
- [ ] (P7) `src/lib/validation/{projects,snapshots}.ts` — zod schemas (shared by API + forms).
- [ ] (P7) `src/lib/api.ts` — typed fetch helpers for every route.
- [ ] (P7) `POST /api/projects`, `GET /api/projects`.
- [ ] (P7) `POST /api/projects/[id]/snapshots` — **inserts `queued` row only, no Playwright**.
- [ ] (P7) `GET /api/snapshots/[id]` — progress, `no-store`.
- [ ] (P7) `GET /api/snapshots/[id]/pages` — summary list, server-side `?search=`, keyset pagination.
- [ ] (P7) `GET /api/pages/[id]` — parsed headings/schema/links.
- [ ] (P7) `GET /api/pages/[id]/screenshot` + `/pdf` — **path from DB by id, traversal-guarded stream**.
- [ ] (P8) Root layout: `QueryClientProvider` + Sonner `<Toaster />`; dashboard `/` + project `/projects/[id]` + dialogs.
- [ ] (P9) `/snapshots/[id]` table, live 2s polling (stop at terminal), lazy expand, **stubbed ZIP Export button**.
- [ ] (P10) `/pages/[id]` full-width screenshot viewer + full extracted-data panel.
- [ ] (P11) `GET /api/snapshots/compare` + `/projects/[id]/compare` page + redirect-map CSV.
- [ ] (P12) `GET /api/health` + heartbeat model, `POST …/rerun-failed`, capture log UI, settings constants file, worker-not-running banner.
- [ ] Verify: enqueue with worker **stopped** → UI shows persistent `queued` (proves API does no work);
      start the worker → status advances, table fills live, terminal toast fires. See
      [Testing & verification](./09-testing-and-verification.md).

---

## 8. Open questions

- **ZIP export contents.** The Phase 9 button is stubbed; the eventual ZIP's exact contents
  (screenshots only vs. + PDFs + archived HTML + a CSV manifest) is not yet decided.
- **Pagination default.** `take=100` for the pages list is a guess; confirm against realistic
  `maxPages` (up to 1000) and table performance — see [Risks & scaling](./10-risks-and-scaling.md).
- **Auth.** This is local-first and currently unauthenticated. If multi-user/hosted later, every
  route needs an auth guard and project-scoped authorization — not designed here.
- **SSE/WebSocket vs polling.** We chose 2s polling (simple, matches TanStack Query, no extra infra).
  Revisit only if snapshots get large enough that 2s polling feels laggy.
- **Heartbeat storage shape.** The Phase 12 heartbeat is a new row/model; whether it is a singleton
  row or per-worker is deferred to the Phase 12 file ([`./phases/phase-12-hardening-and-scale.md`](./phases/phase-12-hardening-and-scale.md)).
