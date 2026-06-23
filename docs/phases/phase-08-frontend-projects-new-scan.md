# Phase 8 · Frontend — Projects + New Scan

_Status: ✅ provided · last updated 2026-06-23 · workstream: UI / Frontend_

## Goal

The dashboard and the "new project / start scan" flow.

## Prompt to paste

```text
TASK 8: Build the frontend foundation with shadcn/ui + TanStack Query.

- Wrap the app in a QueryClientProvider and add the Sonner toaster.
- /  (dashboard): list projects as cards (name, domain, snapshot count, last
  capture date). A "New project" button opens a dialog (name + domain) that POSTs
  to /api/projects.
- /projects/[id]: shows the project's snapshots and a "New snapshot" button that
  opens a dialog (label, discovery mode select sitemap|crawl, maxPages) and POSTs
  to create a snapshot. On success, navigate to the snapshot page.
- Use TanStack Query for all fetches; show loading and error states; toast on
  success/failure. Keep styling clean and flat (white surfaces, subtle borders) to
  match shadcn defaults.
```

## Task breakdown

- [ ] **8.1** Wrap the app in `QueryClientProvider`; add the Sonner `<Toaster />` in the root layout.
- [ ] **8.2** `/` dashboard: project **cards** (name, domain, snapshot count, last capture date).
- [ ] **8.3** "New project" button → dialog (name + domain) → `POST /api/projects`.
- [ ] **8.4** `/projects/[id]`: list the project's snapshots.
- [ ] **8.5** "New snapshot" button → dialog (label, discovery select `sitemap|crawl`, maxPages) → `POST /api/projects/[id]/snapshots`; on success **navigate to the snapshot page**.
- [ ] **8.6** TanStack Query for all fetches; loading + error states; success/failure toasts; clean flat shadcn styling.

## Files this phase creates

- Dashboard page (`/`) + project page (`/projects/[id]`)
- New-project and new-snapshot dialogs
- Root layout providers (`QueryClientProvider`, Sonner)

> UI design + query keys: [08 · API & UI §5](../08-api-and-ui.md).

## Run & verify

- [ ] Create a project in the UI.
- [ ] Start a snapshot → get redirected to the (next) snapshot page.
- [ ] A new `queued` snapshot appears and the worker starts on it.

## Dependencies

Needs Phase 7 (API) and Phase 1 (shadcn components installed). Works best with the worker (Phase 6) running so a started scan
visibly progresses.

## Definition of Done

- [ ] Tasks 8.1–8.6 complete; all fetches via TanStack Query with loading/error/toasts.
- [ ] Create-project and start-snapshot flows work end-to-end.
- [ ] `tsc --noEmit` + `eslint` clean.
- [ ] Committed (e.g. `feat(ui): dashboard, project page, new-project/new-snapshot flows`).
