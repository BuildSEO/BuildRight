# Phase 7 · API Routes

_Status: ✅ provided · last updated 2026-06-23 · workstream: API Layer_

## Goal

The HTTP surface the UI talks to. **Thin** — it only reads/writes the DB and serves files; it **never runs Playwright**.

## Prompt to paste

```text
TASK 7: Build Next.js App Router route handlers under src/app/api. Validate all
inputs with zod. Return JSON.

- POST /api/projects            { name, domain } -> create Project
- GET  /api/projects            -> list projects (with snapshot counts)
- POST /api/projects/[id]/snapshots  { label?, discovery?, maxPages? }
        -> create a Snapshot (status "queued") and return it. (The worker picks it up.)
- GET  /api/snapshots/[id]      -> snapshot with status, totalPages, donePages
        (for progress polling)
- GET  /api/snapshots/[id]/pages -> list pages with summary fields (url, httpStatus,
        title, status, capturedAt, screenshotPath). Support ?search= and pagination.
- GET  /api/pages/[id]          -> full page detail incl. parsed headings/schema/links
        (JSON.parse the stored strings before returning).
- GET  /api/pages/[id]/screenshot -> stream the .webp file with correct content-type.
        Read the path from the DB; never accept a raw filesystem path from the client.
- GET  /api/pages/[id]/pdf      -> stream the .pdf if present.

Add a thin src/lib/api.ts of typed fetch helpers the frontend will use.
```

## Task breakdown

- [ ] **7.1** `POST /api/projects` `{ name, domain }` → create Project (zod-validated).
- [ ] **7.2** `GET /api/projects` → list projects with snapshot counts.
- [ ] **7.3** `POST /api/projects/[id]/snapshots` `{ label?, discovery?, maxPages? }` → create `Snapshot(status="queued")`, return it.
- [ ] **7.4** `GET /api/snapshots/[id]` → status + `totalPages` + `donePages` (polling endpoint; `no-store`).
- [ ] **7.5** `GET /api/snapshots/[id]/pages` → summary fields; support `?search=` + pagination.
- [ ] **7.6** `GET /api/pages/[id]` → full detail; `JSON.parse` headings/schema/links before returning.
- [ ] **7.7** `GET /api/pages/[id]/screenshot` → stream `.webp`, content-type set; **path read from DB by id, never from the client** (path-traversal guard).
- [ ] **7.8** `GET /api/pages/[id]/pdf` → stream `.pdf` if present.
- [ ] **7.9** `src/lib/api.ts` typed fetch helpers for the frontend.
- [ ] **7.10** Clean `404` for missing ids; every handler `runtime = "nodejs"`; all inputs zod-validated.

## Files this phase creates

- Route handlers under `src/app/api/...`
- `src/lib/api.ts`

> Full route + envelope design: [08 · API & UI](../08-api-and-ui.md). The API only ever writes `queued`; the worker advances
> it ([03 · Architecture](../03-architecture.md)).

## Run & verify

With the worker running:

```bash
curl -X POST http://localhost:3000/api/projects -H 'content-type: application/json' -d '{"name":"Acme","domain":"acme.com"}'
# create a snapshot under that project, then:
curl http://localhost:3000/api/snapshots/<id>     # progress climbs
curl http://localhost:3000/api/pages/<id>/screenshot --output shot.webp   # returns an image
```

- [ ] Snapshot progress climbs as the worker runs.
- [ ] The screenshot endpoint returns a valid image.

## Debug / edge cases

- **Path traversal:** the screenshot/pdf routes must look up the path from the DB **by page id**, never take a path from the
  query string.
- Return **404 cleanly** for missing ids — the UI relies on it.

## Dependencies

Needs Phase 2 (schema) and benefits from Phase 6 (worker) running to show live progress. Independent of the worker except via
the DB — can be built in parallel with the capture path.

## Definition of Done

- [ ] Tasks 7.1–7.10 complete; all inputs zod-validated; asset routes resolve paths from the DB only.
- [ ] `curl` flow works against a running worker; screenshot streams.
- [ ] `tsc --noEmit` + `eslint` clean.
- [ ] Committed (e.g. `feat(api): projects/snapshots/pages routes + asset streaming`).
