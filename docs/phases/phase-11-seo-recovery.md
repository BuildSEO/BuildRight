# Phase 11 · SEO Recovery Features (the payoff)

_Status: ✅ provided · last updated 2026-06-23 · workstream: SEO Recovery / Compare_

## Goal

The diffing that makes this worth more than a screenshot folder. **Build last, once capture is reliable.**

## Prompt to paste

```text
TASK 11: Build snapshot comparison.

- API: GET /api/snapshots/compare?from=A&to=B -> compares two snapshots of the same
  project by URL.
- Produce three reports:
  1. "Disappeared" — URLs present in A but missing in B, or now 4xx/5xx in B.
     (Highest priority: the #1 ranking killer in redesigns.)
  2. "Changed" — for URLs in both: diffs of title, H1, meta robots, canonical, and
     a count of removed internal links and removed schema types.
  3. "Redirect suggestions" — for disappeared URLs, suggest the closest surviving URL
     in B by title/H1 text similarity (simple token-overlap score is fine to start).
     Output as a CSV-ready old->new mapping.
- UI: /projects/[id]/compare with two snapshot pickers and the three reports as
  tables, plus "download redirect map CSV".
```

## Task breakdown

- [ ] **11.1** `GET /api/snapshots/compare?from=A&to=B` — compare two snapshots of the **same project** by URL (zod-validate the ids).
- [ ] **11.2** Report 1 **"Disappeared"**: URLs in A missing in B, or now 4xx/5xx in B.
- [ ] **11.3** Report 2 **"Changed"**: for URLs in both, diff title, H1, meta robots, canonical; count removed internal links and removed schema types.
- [ ] **11.4** Report 3 **"Redirect suggestions"**: for disappeared URLs, closest surviving URL in B by title/H1 **token-overlap** similarity; CSV-ready old→new mapping.
- [ ] **11.5** UI `/projects/[id]/compare`: two snapshot pickers + the three reports as tables + **"download redirect map CSV"**.

## Files this phase creates

- Compare API route (`/api/snapshots/compare`)
- `/projects/[id]/compare` page

> The token-overlap similarity is a pure, unit-testable function — assert it against fixture pairs
> ([09 · Testing](../09-testing-and-verification.md)). Compares read `Page` rows by `url` across two snapshots
> ([06 · Data Model](../06-data-model.md)).

## Run & verify

- [ ] Capture a site, change something (or capture two real points in time), then compare.
- [ ] "Disappeared" and "Changed" reports are accurate.
- [ ] The redirect-map CSV is sensible (old→new mapping downloads).

## Dependencies

Needs reliable captures across **two** snapshots of the same project (Phases 6–10). Read-only over existing data.

## Definition of Done

- [ ] Tasks 11.1–11.5 complete; three reports accurate; CSV downloads.
- [ ] Similarity scoring is a pure function with unit tests.
- [ ] `tsc --noEmit` + `eslint` clean.
- [ ] Committed (e.g. `feat(compare): snapshot diff reports + redirect-map CSV`).
