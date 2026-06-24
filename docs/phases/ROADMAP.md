# Phase Roadmap

_Status: all 13 phases (0–12) implemented ✅ · last updated 2026-06-24_

The build proceeds in self-contained phases. **Rule:** build → run → verify → commit, then move to the next phase. Never
start a later phase early (Phase 0 rule). Each phase file has Goal, the exact Prompt to paste, a task breakdown, Files,
Run & verify, Debug/edge cases, and a Definition of Done.

| # | Phase | Workstream | File |
| --- | --- | --- | --- |
| 0 | Project brief (ground rules) | Cross-cutting | [phase-00-project-brief.md](./phase-00-project-brief.md) |
| 1 | Scaffolding | Foundation & Tooling | [phase-01-scaffolding.md](./phase-01-scaffolding.md) |
| 2 | Database layer | Data & Storage | [phase-02-database-layer.md](./phase-02-database-layer.md) |
| 3 | Page discovery | URL Discovery | [phase-03-page-discovery.md](./phase-03-page-discovery.md) |
| 4 | Capture & extract core | Capture Engine | [phase-04-capture-extract-core.md](./phase-04-capture-extract-core.md) |
| 5 | Compression (WebP + PDF) | Compression & Export | [phase-05-compression.md](./phase-05-compression.md) |
| 6 | The worker | Worker & Concurrency | [phase-06-worker.md](./phase-06-worker.md) |
| 7 | API routes | API Layer | [phase-07-api-routes.md](./phase-07-api-routes.md) |
| 8 | Frontend — projects + new scan | UI / Frontend | [phase-08-frontend-projects-new-scan.md](./phase-08-frontend-projects-new-scan.md) |
| 9 | Frontend — snapshot table | UI / Frontend | [phase-09-snapshot-table.md](./phase-09-snapshot-table.md) |
| 10 | Frontend — screenshot viewer | UI / Frontend | [phase-10-screenshot-viewer.md](./phase-10-screenshot-viewer.md) |
| 11 | SEO recovery (compare) | SEO Recovery | [phase-11-seo-recovery.md](./phase-11-seo-recovery.md) |
| 12 | Hardening + path to SaaS | Hardening / Scaling | [phase-12-hardening-and-scale.md](./phase-12-hardening-and-scale.md) |

## Build order & why it's safe

The order is deliberate — each phase is verifiable in isolation before the next depends on it:

1. **0–2 (foundation):** rules → running app → schema. The spine everything hangs off.
2. **3–5 (pure-ish capture units):** discovery, capture, compression — each has its own `scripts/test-*.ts` so you prove
   it with `tsx` **before** any worker or UI exists. This is where most bugs live, caught early and locally.
3. **6 (worker):** wires 3–5 together behind the queue. First true end-to-end capture.
4. **7 (API):** thin DB/file surface. Can be built in parallel with 3–6 (integrated only at the DB).
5. **8–10 (UI):** dashboard → live table → viewer. Consumes the API.
6. **11 (compare):** the SEO-recovery payoff — needs two reliable snapshots.
7. **12 (hardening):** WAL, retries, heartbeat, settings, README, and the documented SaaS upgrade path.

## Daily run (once built)

```bash
# terminal 1
npm run dev          # the web app at localhost:3000
# terminal 2
npm run worker       # the capture worker
# inspect data
npm run db:studio
```

## Status tracking

As each phase is completed and committed, mark it here and tick its Definition of Done in the phase file. The
[Task Board](../11-task-board.md) holds the fine-grained, workstream-grouped checklist.
