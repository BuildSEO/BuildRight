# Phase 0 · Project Brief (ground rules)

_Status: ✅ provided · paste this first · last updated 2026-06-23_

## Goal

Set the ground rules so every later prompt produces consistent, debuggable code. This anchors
the agent. Without it you get inconsistent patterns across phases and the agent tends to
over-build.

## Prompt to paste

```text
You are helping me build a local-first web app called "SEO Snapshot Tool".
Read this brief and follow it for every task I give you in this session.

PURPOSE: A marketing agency tool. I enter a client's domain, the app discovers
all pages (via sitemap, falling back to a crawl), captures a full-page screenshot
of each page, compresses it to WebP under 5 MB, and extracts SEO fields
(HTTP status, title, meta description, canonical, meta robots, H1, JSON-LD schema,
and all on-page links). Everything is stored locally so that after we redesign a
client site, I can prove what was there before and recover rankings.

STACK: Next.js (App Router) + TypeScript (strict), Tailwind + shadcn/ui,
TanStack Query, Prisma with SQLite, Playwright (Chromium), p-queue, sharp,
pdf-lib, fast-xml-parser, zod.

ARCHITECTURE: The Next.js app serves UI + API. A SEPARATE worker process
(src/worker/index.ts) does all the heavy Playwright work by polling the database
for queued jobs. The API never runs Playwright directly. Files go on local disk;
metadata goes in SQLite.

RULES:
- TypeScript strict mode. No "any" unless unavoidable, and comment why.
- Small, single-responsibility modules. Pure functions where possible so I can
  unit-test capture/discover/compress in isolation.
- Every external operation (network, browser, disk) wrapped in try/catch with a
  clear logged error. Never swallow errors silently.
- Use the logger in src/lib/logger.ts, not console.log, in worker and capture code.
- All API inputs validated with zod.
- No secrets in code. Use .env.
- When you finish a task, tell me exactly: which files you created/changed, the
  command to run it, and how I verify it worked.
- Do not build future phases ahead of time. Only do the task I ask for.

Confirm you understand, then wait for my first task. Do not write code yet.
```

## Files

None. This phase writes no code — it only establishes the rules.

## Run & verify

The agent confirms understanding and **waits** for the first task without writing code.

## The rules, restated as our standing contract

These are enforced in every later phase and detailed in
[Conventions](../05-conventions.md):

1. **TypeScript strict.** No `any` unless unavoidable — and comment why.
2. **Small, single-responsibility modules.** Pure functions where possible
   (discover / capture / compress are unit-testable in isolation).
3. **Wrap every external op** (network, browser, disk) in try/catch with a clear logged
   error. Never swallow errors silently.
4. **Use `src/lib/logger.ts`, not `console.log`,** in worker and capture code.
5. **Validate all API inputs with zod.**
6. **No secrets in code** — use `.env`.
7. **On finishing a task,** state exactly which files changed, the run command, and the verify
   steps.
8. **Don't build ahead.** Only do the asked task.

## Why this matters

This is the most important phase even though it writes nothing: it makes every later phase
predictable and the resulting code uniform and debuggable.

## Definition of Done

- [ ] Brief pasted as the first message of the build session.
- [ ] Agent confirms understanding and does not write code.
- [ ] These rules are mirrored in [05 · Conventions](../05-conventions.md).
