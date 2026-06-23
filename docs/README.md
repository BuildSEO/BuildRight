# BuildRight — SEO Snapshot Tool · Build Plan

_Planning workspace · last updated 2026-06-23_

This `docs/` folder is the complete plan for **BuildRight** (the SEO Snapshot Tool) — organized so you and I stay on the
same page. **No app code is written yet.** Below is the map, the current status, and the few decisions worth confirming
before we start building.

> **What it is, in one line:** a local-first web app that captures a full-page screenshot + all SEO fields of every page
> on a client's site, stored on disk, so you can prove what was there before a redesign and recover rankings. Full
> description in [01 · Overview](./01-overview.md).

## How the plan is organized

The work is split two ways: **thematic docs** (the durable "how it's built" reference) and **phase files** (the
sequential "what to build next" playbook). Tasks are grouped by **workstream** in the task board.

### Thematic docs

| Doc | What it covers |
| --- | --- |
| [01 · Overview](./01-overview.md) | What the app is, the end-to-end flow, guiding principles |
| [02 · Tech Stack](./02-tech-stack.md) | Every dependency, why it was chosen, the upgrade path |
| [03 · Architecture](./03-architecture.md) | UI + API + worker split, data flow, failure isolation |
| [04 · Folder Structure](./04-folder-structure.md) | Target tree, file-by-file responsibilities |
| [05 · Conventions](./05-conventions.md) | The Phase 0 rules expanded into an enforceable standard |
| [06 · Data Model](./06-data-model.md) | Prisma schema (the spine), state machines, on-disk layout |
| [07 · Capture Pipeline](./07-capture-pipeline.md) | discover / capture / compress / pipeline / worker contracts |
| [08 · API & UI](./08-api-and-ui.md) | Route inventory + screens, polling, components |
| [09 · Testing & Verification](./09-testing-and-verification.md) | Test strategy + per-phase quality gates _(see decision #1)_ |
| [10 · Risks & Scaling](./10-risks-and-scaling.md) | Risk register + the no-rewrite cloud path |
| [11 · Task Board](./11-task-board.md) | Every task, grouped into 10 workstreams, with checkboxes |

### Phase files — the build playbook

The 13 phases, each self-contained (build → run → verify → commit → next). Tracker:
[phases/ROADMAP](./phases/ROADMAP.md).

| # | Phase | # | Phase |
| --- | --- | --- | --- |
| [0](./phases/phase-00-project-brief.md) | Project brief | [7](./phases/phase-07-api-routes.md) | API routes |
| [1](./phases/phase-01-scaffolding.md) | Scaffolding | [8](./phases/phase-08-frontend-projects-new-scan.md) | Frontend: projects + new scan |
| [2](./phases/phase-02-database-layer.md) | Database layer | [9](./phases/phase-09-snapshot-table.md) | Frontend: snapshot table |
| [3](./phases/phase-03-page-discovery.md) | Page discovery | [10](./phases/phase-10-screenshot-viewer.md) | Frontend: viewer |
| [4](./phases/phase-04-capture-extract-core.md) | Capture & extract core | [11](./phases/phase-11-seo-recovery.md) | SEO recovery (compare) |
| [5](./phases/phase-05-compression.md) | Compression | [12](./phases/phase-12-hardening-and-scale.md) | Hardening + SaaS path |
| [6](./phases/phase-06-worker.md) | The worker | | |

## Current status

- ✅ All 13 phases (0–12) captured as detailed, paste-ready phase files.
- ✅ All thematic docs written and **reconciled against your verbatim spec** (the early forward-looking drafts of the
  capture and API docs were corrected where they diverged — see "Reconciliations" below).
- ✅ Cross-links between docs fixed and verified.
- ⛔ **No application code written.** Waiting for your green light.

## Reconciliations already applied

While drafting, specialist passes surfaced places where an early guess conflicted with your actual spec. These are now
**fixed** in the docs:

- **Discovery** uses `fetch` + a lightweight HTML parser for the crawl (not Playwright); signature is
  `discoverUrls(domain, { mode, maxPages })`.
- **Capture** is `capturePage(browser, url)` with the cookie-hiding, auto-scroll lazy-load, font/image waits, and
  optional sticky-header neutralizing steps; `networkidle` → `domcontentloaded` fallback.
- **PDF** conversion goes PNG → **JPEG** first (pdf-lib can't embed WebP), sliced into 1400px strips; the **16383px WebP
  max-dimension** is called out for very tall pages.
- **API** uses per-page routes (`/api/pages/[id]/screenshot`, `/pdf`) that resolve paths from the DB — no generic asset
  catch-all, no worker-assembled combined-PDF endpoint.
- **Export** is a **ZIP** button, stubbed in Phase 9 (not a PDF export job).
- **Resumability** is in scope locally: the worker resets stuck `capturing` pages to `queued` on startup (Phase 6).
- **Phase 12** adds a worker-heartbeat model — noted as a planned addition in [06 · Data Model §10](./06-data-model.md).

## Decisions (resolved 2026-06-23)

The spec resolved almost everything (concurrency 3–4, viewport 1440 / DSR 1.5, quality ladder 82→70→60→50, 25000px height
cap, tracking-param stripping, WAL, etc.). The three remaining calls are now made:

1. **Automated testing — ✅ YES, added.** We run **vitest** unit tests for the pure logic (URL normalization, WebP
   size-reduction loop, SEO extraction, compare similarity, `paths.ts`), **keep** the `scripts/test-*.ts` manual smoke
   scripts for eyeballing real sites, add a tiny **fixture site + a couple of integration tests** once the pipeline exists
   (Phase 6+), and gate every commit on `typecheck + lint + unit`. A smoke Playwright E2E is optional near the end. See
   [09 · Testing](./09-testing-and-verification.md).
2. **`exactOptionalPropertyTypes` — ✅ kept ON.** Worth the small friction; we handle Prisma optionals explicitly.
   See [05 · Conventions §1.1](./05-conventions.md).
3. **SSRF / private-IP guard — ✅ added now.** Cheap insurance: discovery validates the domain and blocks `localhost` /
   loopback / private IP ranges, http(s)-only, re-checked on redirect ([10 · R11](./10-risks-and-scaling.md)). Full
   multi-tenant auth stays deferred to the SaaS phase.

### Testing cadence (when each layer lands)

- **Phase 1:** install vitest; add `test:unit`, `typecheck`, `lint`, `verify` scripts; commit gate = typecheck + lint.
- **Phases 3/4/5:** unit-test each pure function as it's written (normalization, extraction, WebP loop).
- **Phase 6+:** fixture site + integration tests for the pipeline; gate adds `test:unit`.
- **Phase 11:** unit-test the similarity score. **Phase 12:** optional smoke E2E + CI.

## How we'll work, phase by phase

For each phase you start, I will: paste/execute the phase's prompt, build **only** that phase, then report **files changed
+ run command + how to verify** (the Phase 0 contract), and stop for your verification before committing and moving on.
