# Phase 6 · The Worker (orchestration)

_Status: ✅ provided · last updated 2026-06-23 · workstream: Worker & Concurrency_

## Goal

A long-running process that turns queued snapshots into captured pages, with progress and error handling.

## Prompt to paste

```text
TASK 6: Build the worker.

Create src/capture/pipeline.ts:
  export async function captureOnePage(browser, page /* Page row */): Promise<void>
  - Calls capturePage(), then toWebpUnderLimit() and (optionally) toPdf().
  - Writes the .webp, optional .pdf, and a gzipped .html.gz to disk under
    snapshotDir(projectId, snapshotId) using paths.ts.
  - Updates the Page row in the DB: status "done", httpStatus, all extracted fields
    (JSON.stringify the headings/schema/links), file paths, width/height, fileSize,
    capturedAt. On error: status "failed", error message. Never throw out of here —
    one bad page must not kill the run.

Create src/worker/index.ts:
  - A loop that every few seconds:
    1. Finds the oldest Snapshot with status "queued". If none, sleep and repeat.
    2. Sets it "discovering", runs discoverUrls(domain, {mode, maxPages}), inserts
       a Page row (status "queued") for each URL, sets snapshot.totalPages.
    3. Sets snapshot "capturing". Launches ONE chromium browser. Uses p-queue with
       concurrency 3-4 to run captureOnePage for every queued page of this
       snapshot, incrementing snapshot.donePages after each.
    4. When all pages settle, set snapshot "done", finishedAt = now. Close browser.
    5. Wrap the whole snapshot in try/catch: on fatal error set "failed" + error.
  - Graceful shutdown on SIGINT/SIGTERM: stop accepting new work, let in-flight
    captures finish, close the browser.
  - Use the logger throughout (snapshot id, page url, timings).

Run the worker with: npm run worker. It should idle-log "no queued snapshots" until
I create one.
```

## Task breakdown

- [ ] **6.1** `pipeline.ts` `captureOnePage(browser, pageRow)`: `capturePage()` → `toWebpUnderLimit()` → optional `toPdf()`.
- [ ] **6.2** Write `.webp` + optional `.pdf` + gzipped `.html.gz` under `snapshotDir(projectId, snapshotId)` via `paths.ts`.
- [ ] **6.3** Update Page row on success: `done`, `httpStatus`, extracted fields (`JSON.stringify` headings/schema/links), paths, width/height, `fileSizeBytes`, `capturedAt`. On error: `failed` + `error`. **Never throw out.**
- [ ] **6.4** `worker/index.ts` poll loop: claim oldest `queued` Snapshot; sleep + repeat if none.
- [ ] **6.5** Set `discovering`; run `discoverUrls`; insert a `queued` Page per URL; set `totalPages`.
- [ ] **6.6** Set `capturing`; launch **one** Chromium; `p-queue` concurrency **3–4** (config constant); run `captureOnePage` per page; increment `donePages` after each.
- [ ] **6.7** On settle: `done` + `finishedAt`, close browser. Wrap whole snapshot in try/catch → fatal → `failed` + `error`.
- [ ] **6.8** Graceful SIGINT/SIGTERM: stop new work, let in-flight finish, close browser.
- [ ] **6.9** **Enable WAL** (`PRAGMA journal_mode=WAL`) once at startup.
- [ ] **6.10** **Resume**: on startup reset any `capturing` snapshot's un-done pages back to `queued`.
- [ ] **6.11** Small **per-page timeout** so one hanging page can't stall the queue.
- [ ] **6.12** Logger throughout (snapshot id, page url, timings).

## Files this phase creates

- `src/capture/pipeline.ts`
- `src/worker/index.ts`

> Full design: [07 · Capture Pipeline §5–§8](../07-capture-pipeline.md). State machine + counters:
> [06 · Data Model §4](../06-data-model.md). Concurrency/contention risks: [10 · Risks R2, R7, R10](../10-risks-and-scaling.md).

## Run & verify

```bash
npm run worker   # idles, logging "no queued snapshots"
```

Then in Prisma Studio (`npm run db:studio`) manually insert a `Snapshot` row (`status=queued`, a real domain).

- [ ] The worker discovers pages, captures them, and files appear under `data/archive/...`.
- [ ] `donePages` climbs to `totalPages`; snapshot ends `done`.
- [ ] A deliberately bad URL ends as one `failed` Page without killing the run.

## Debug / edge cases

- **Concurrency too high** → RAM spikes and captures fail. **3–4** is the local sweet spot; make it a config constant.
- **One browser, many contexts** (not one browser per page) — far less RAM. Confirm `capturePage` closes its context every
  time, or you leak memory over a 200-page run.
- **SQLite "database is locked"** under concurrent writes → enable **WAL** once at startup. Prisma + SQLite handles this
  fine at this scale with WAL.
- **Crashed worker mid-run** leaves a snapshot stuck `capturing` → on startup, reset that snapshot's un-done pages back to
  `queued` so it can resume.
- **Per-page timeout** so one hanging page can't stall the queue forever.

## Dependencies

Needs Phases 3 (discover), 4 (capture), 5 (compress), and the Phase 2 schema + `paths.ts`. This is the integration point of
the whole capture path.

## Definition of Done

- [ ] Tasks 6.1–6.12 complete; `captureOnePage` never throws; WAL on; resume works.
- [ ] End-to-end: queue a snapshot → worker captures it → assets on disk, rows `done`, `donePages == totalPages`.
- [ ] `tsc --noEmit` + `eslint` clean; logger only.
- [ ] Committed (e.g. `feat(worker): job loop + p-queue capture pipeline with WAL + resume`).
