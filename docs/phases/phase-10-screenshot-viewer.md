# Phase 10 · Frontend — Full-Page Screenshot Viewer

_Status: ✅ provided · last updated 2026-06-23 · workstream: UI / Frontend_

## Goal

The viewer screen — full capture + metadata + format download.

## Prompt to paste

```text
TASK 10: Build /pages/[id] — the screenshot viewer.

- Top bar: back button, the URL, format buttons (webp active; pdf if a pdf exists;
  png optional), and a Download button that hits the right endpoint.
- Metadata row: dimensions, file size, captured time, HTTP status.
- Main area: the full-page WebP shown at full width inside a bordered frame,
  scrolling naturally with the page (no nested scroll box).
- A side/below panel with the full extracted data: all headings (h1-h6), canonical,
  meta robots, meta description, schema blocks (pretty-printed JSON), and the full
  links list (anchor + href + internal/external).
- Fetch from /api/pages/[id].
```

## Task breakdown

- [ ] **10.1** Top bar: back button, URL, format buttons (webp active; pdf if a pdf exists; png optional), Download button → correct endpoint.
- [ ] **10.2** Metadata row: dimensions, file size, captured time, HTTP status.
- [ ] **10.3** Main area: full-page WebP at full width in a bordered frame, **natural page scroll** (no nested scroll box).
- [ ] **10.4** Side/below panel: all headings h1–h6, canonical, meta robots, meta description, schema blocks (**pretty-printed JSON**), full links list (anchor + href + internal/external).
- [ ] **10.5** Fetch from `/api/pages/[id]`.

## Files this phase creates

- `/pages/[id]` viewer page

> Design: [08 · API & UI §5](../08-api-and-ui.md). Served via the per-page screenshot/pdf routes from
> [Phase 7](./phase-07-api-routes.md).

## Run & verify

- [ ] Clicking a thumbnail opens the full capture.
- [ ] Downloads work for each available format (webp / pdf if present / png optional).
- [ ] All extracted fields render (headings, canonical, robots, meta, schema JSON, links).

## Dependencies

Needs Phase 7 (`/api/pages/[id]`, screenshot, pdf) and Phase 9 (navigated from the table thumbnail).

## Definition of Done

- [ ] Tasks 10.1–10.5 complete; full-width image scrolls naturally; all fields render.
- [ ] Format downloads work.
- [ ] `tsc --noEmit` + `eslint` clean.
- [ ] Committed (e.g. `feat(ui): full-page screenshot viewer with extracted-data panel`).
