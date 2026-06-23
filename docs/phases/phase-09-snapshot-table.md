# Phase 9 · Frontend — The Snapshot Table (core view)

_Status: ✅ provided · last updated 2026-06-23 · workstream: UI / Frontend_

## Goal

The expandable table from the mockup, with live progress while scanning.

## Prompt to paste

```text
TASK 9: Build /snapshots/[id] — the page table view.

- Header: domain, snapshot label, and a live progress bar (donePages/totalPages)
  using the shadcn progress component. Poll GET /api/snapshots/[id] every 2s via
  TanStack Query's refetchInterval while status is "discovering" or "capturing";
  stop polling when "done"/"failed".
- A table (shadcn table) of pages, columns: thumbnail, URL + title, HTTP status
  badge (green 2xx, amber 3xx, red 4xx/5xx), captured time, and an expand chevron.
- The thumbnail is the screenshot endpoint (small). Clicking a row expands an inline
  panel showing: Title, H1, Schema (as tags), and Links (count + first several, with
  a "view all" that opens a sheet). Fetch full detail from /api/pages/[id] lazily
  when a row is first expanded.
- Clicking the thumbnail navigates to the full screenshot viewer (Phase 10).
- A search box filters by URL/title (server-side via ?search=).
- An "Export" button that downloads a zip (defer the implementation; just stub the
  button for now).
```

## Task breakdown

- [ ] **9.1** Header: domain, label, live **progress bar** (`donePages/totalPages`, shadcn `progress`).
- [ ] **9.2** Poll `GET /api/snapshots/[id]` every **2s** via TanStack Query `refetchInterval` while `discovering|capturing`; **stop** at `done|failed`.
- [ ] **9.3** Table columns: thumbnail, URL + title, HTTP status **badge** (green 2xx / amber 3xx / red 4xx–5xx), captured time, expand chevron.
- [ ] **9.4** Thumbnail = screenshot endpoint (small). Click thumbnail → `/pages/[id]` viewer (Phase 10).
- [ ] **9.5** Row expand → inline panel: Title, H1, Schema (as tags), Links (count + first several, "view all" opens a sheet). **Lazy-fetch** `/api/pages/[id]` on first expand.
- [ ] **9.6** Search box → server-side filter via `?search=`.
- [ ] **9.7** "Export" button → downloads a zip — **stub the button for now** (defer implementation).

## Files this phase creates

- `/snapshots/[id]` page + row components

> UI design + polling strategy: [08 · API & UI §5](../08-api-and-ui.md).

## Run & verify

- [ ] While a scan runs, rows fill in and the progress bar moves.
- [ ] Expanding a row shows the SEO fields (lazy-loaded).
- [ ] Status badges are color-correct; polling stops once `done`.

## Debug / edge cases

- **Don't fetch every page's full detail upfront** — lazy-load on expand, or the table is slow on 200-page snapshots.
- **Stop the polling interval** once `done`/`failed`, or the tab keeps hammering the API.

## Dependencies

Needs Phase 7 (API: `/api/snapshots/[id]`, `/pages`, `/pages/[id]`, screenshot) and Phase 8 (providers + nav). Best viewed
with the worker (Phase 6) actively capturing.

## Definition of Done

- [ ] Tasks 9.1–9.7 complete; polling stops at terminal; detail lazy-loads.
- [ ] Live fill-in works during a real scan; badges correct.
- [ ] `tsc --noEmit` + `eslint` clean.
- [ ] Committed (e.g. `feat(ui): live snapshot table with expandable SEO rows`).
