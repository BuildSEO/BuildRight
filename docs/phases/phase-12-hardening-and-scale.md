# Phase 12 · Hardening, Team Use, and the Path to SaaS

_Status: ✅ provided · last updated 2026-06-23 · workstream: Hardening / Scaling & Observability_

## Goal

Make it dependable for your team and ready to scale later.

## Prompt to paste

```text
TASK 12: Hardening pass.
- Enable SQLite WAL mode on startup (both app and worker) for concurrent access.
- Add retry-with-backoff (max 2 retries) around capturePage for transient failures.
- Add a per-snapshot capture log the UI can show (which pages failed and why).
- Add a "re-run failed pages" action that re-queues only failed pages of a snapshot.
- Add a settings constant file: concurrency, viewport, deviceScaleFactor, maxPages
  default, size limit, height cap, cookie-banner selector list.
- Add a /api/health endpoint and a simple worker heartbeat row so the UI can warn
  "worker not running" if no heartbeat in 30s.
- Document, in a README, how to run app + worker together and how to back up the
  data/ folder.
```

## Task breakdown

- [ ] **12.1** Enable SQLite **WAL** on startup in **both** app and worker.
- [ ] **12.2** **Retry-with-backoff** (max 2) around `capturePage` for transient failures.
- [ ] **12.3** **Per-snapshot capture log** the UI can show (which pages failed and why).
- [ ] **12.4** **"Re-run failed pages"** action — re-queue only the `failed` pages of a snapshot.
- [ ] **12.5** **Settings constants file**: concurrency, viewport, `deviceScaleFactor`, maxPages default, size limit, height cap, cookie-banner selector list. _(Centralizes the magic numbers scattered through Phases 4–6.)_
- [ ] **12.6** `/api/health` endpoint + a **worker heartbeat row** (new model) so the UI warns "worker not running" if no heartbeat in 30s.
- [ ] **12.7** **README**: how to run app + worker together; how to back up the `data/` folder.

> **Schema note:** the worker heartbeat (12.6) is a **new model** added in this phase, not part of the Phase 2 schema —
> see the planned-additions note in [06 · Data Model](../06-data-model.md).

## Files this phase touches

- `src/lib/db.ts` (WAL), worker + app startup
- `src/capture/pipeline.ts` / `capture.ts` (retry-with-backoff)
- A settings constants module (e.g. `src/lib/settings.ts`)
- `/api/health` route + heartbeat model + UI warning
- "Re-run failed pages" API action + UI button
- `README.md`

## Run & verify

- [ ] Concurrent app + worker access works without "database is locked".
- [ ] A transient capture failure retries up to twice.
- [ ] The capture log lists failed pages with reasons; "re-run failed pages" re-queues only those.
- [ ] Stopping the worker makes the UI show "worker not running" within ~30s; `/api/health` responds.
- [ ] README documents running both processes and backing up `data/`.

## Running for your team (local network)

- Run on one always-on machine. Build with `next build`, start with `next start -H 0.0.0.0`, and run the worker alongside
  it (a process manager like **pm2** keeps both alive and restarts on crash).
- Teammates open `http://<that-machine-ip>:3000`. Open the port on the host firewall.
- **Back up `data/`** (the SQLite file + the archive folder) on a schedule — that folder is your entire archive.

## The SaaS upgrade path (no rewrite)

This is the payoff of the worker-split architecture — see [10 · Risks & Scaling](../10-risks-and-scaling.md) for the full
plan. In short:

- `provider = "postgresql"` in Prisma + a connection string; switch JSON-string columns to real `Json` columns.
- Replace p-queue with **BullMQ + Redis**; the worker loop becomes a BullMQ processor; run multiple worker containers.
- Move `data/archive` to **Cloudflare R2 / S3** (store the object key in the DB; R2/B2 to avoid egress fees).
- Run Playwright workers in **Docker** on a container host (Railway/Render/Fly/Hetzner) — keep them off serverless.
- Add **auth, multi-tenancy** (a tenant id on every row), and billing. Because every model already keys off `Project`,
  scoping to a tenant is additive, not a teardown.

## Dependencies

Final phase — hardens everything built in Phases 1–11.

## Definition of Done

- [ ] Tasks 12.1–12.7 complete.
- [ ] WAL on both processes; retry works; capture log + re-run-failed work; heartbeat warning works; README written.
- [ ] `tsc --noEmit` + `eslint` clean.
- [ ] Committed (e.g. `feat(hardening): WAL, retries, capture log, heartbeat, settings, README`).

## The edge-case checklist (pin this)

- [ ] Lazy images load (auto-scroll reached bottom)
- [ ] Cookie/consent banners hidden
- [ ] Sticky headers handled
- [ ] `networkidle` timeout falls back to `domcontentloaded`
- [ ] HTTP status recorded (incl. 4xx/5xx pages still logged)
- [ ] WebP under 5 MB; downscale fallback works
- [ ] WebP max dimension (16383px) handled for very tall pages
- [ ] One browser, one context per page, context always closed
- [ ] Concurrency capped (3–4)
- [ ] SQLite WAL on
- [ ] One failed page never kills the snapshot
- [ ] Crashed worker can resume a stuck snapshot
- [ ] Sitemap index recursion + gzipped sitemap handled
- [ ] Crawl traps capped by maxPages + exclusions
