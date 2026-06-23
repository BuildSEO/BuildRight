# 01 · Project Overview

_Status: planning · last updated 2026-06-23_

## What we're building

**SEO Snapshot Tool** (internal codename **BuildRight**) is a **local-first** web app for a
marketing agency. You give it a client's domain; it produces a complete, timestamped
**snapshot** of that site's SEO state — a full-page screenshot of every page plus the
structured SEO fields behind it — and stores everything **on your own disk**.

### The core problem it solves

When an agency redesigns a client site, rankings sometimes drop. Without a record of
*what the old site contained*, it's hard to diagnose why and hard to recover. BuildRight
captures that record **before** the redesign so you can:

- Prove what titles, descriptions, canonicals, headings, schema, and links existed.
- Compare against the live site after a redesign.
- Recover lost rankings by restoring what worked.

## What a snapshot captures, per page

| Field | Source |
| --- | --- |
| HTTP status | Main navigation response |
| Title | `<title>` |
| Meta description | `<meta name="description">` |
| Canonical | `<link rel="canonical">` |
| Meta robots | `<meta name="robots">` |
| H1 (primary) + all headings | `<h1>`…`<h6>` (stored as JSON) |
| JSON-LD schema | `<script type="application/ld+json">` blocks (JSON array) |
| All on-page links | `[{ href, anchor, internal }]` (JSON) |
| Word count | Rendered text |
| Full-page screenshot | Playwright → compressed to WebP **under 5 MB** |
| Raw HTML | Gzipped to disk |
| Optional PDF | Screenshot embedded into a paginated PDF |

## End-to-end flow (happy path)

1. **Create a project** for the client (name + domain).
2. **Start a snapshot.** The API writes a `Snapshot` row with `status = queued` and returns
   immediately. The API does no heavy work.
3. **The worker picks it up.** A separate long-running process polls for queued snapshots.
   - `discovering` — finds all page URLs: sitemap first, crawl fallback.
   - `capturing` — drives Playwright through each URL at limited concurrency: screenshot →
     compress to WebP → extract SEO fields → gzip raw HTML → write files to disk + metadata
     to SQLite → bump progress counters.
   - `done` / `failed` — sets `finishedAt`.
4. **The UI polls** for progress (TanStack Query) and renders the live counter, then the
   results table and screenshot viewer.
5. **Export** a combined PDF when you need a shareable artifact.

## Why "local-first"

Zero cloud setup, zero per-page cost, and the client's data never leaves the machine. The
architecture is deliberately shaped so the **same code** scales to the cloud later (see
[Architecture](./03-architecture.md) and [Risks & Scaling](./10-risks-and-scaling.md)) — the
local choices (SQLite, p-queue, local disk) each have a documented one-step upgrade.

## Guiding principles

- **Build in phases.** Each phase is self-contained: build → run → verify → commit → next.
  This keeps every bug small and local instead of debugging the whole system at once.
- **The worker split is sacred.** The API never runs Playwright. This is what makes the
  cloud migration a swap rather than a rewrite.
- **Pure functions at the edges.** Discovery, extraction, and compression are written as
  testable pure functions so correctness is verifiable in isolation.

## Map of the planning docs

| Doc | Purpose |
| --- | --- |
| [01 · Overview](./01-overview.md) | This file — what and why |
| [02 · Tech Stack](./02-tech-stack.md) | Every dependency and its rationale |
| [03 · Architecture](./03-architecture.md) | Components, data flow, the worker split |
| [04 · Folder Structure](./04-folder-structure.md) | Target tree, file by file |
| [05 · Conventions](./05-conventions.md) | Coding rules every phase obeys |
| [06 · Data Model](./06-data-model.md) | Prisma schema + on-disk layout |
| [07 · Capture Pipeline](./07-capture-pipeline.md) | discover / capture / compress / worker |
| [08 · API & UI](./08-api-and-ui.md) | Endpoints + screens |
| [09 · Testing & Verification](./09-testing-and-verification.md) | How we keep it bug-free |
| [10 · Risks & Scaling](./10-risks-and-scaling.md) | Risk register + cloud path |
| [11 · Task Board](./11-task-board.md) | Every task, grouped by workstream |
| [phases/ROADMAP](./phases/ROADMAP.md) | Phase 0–12 status tracker |
