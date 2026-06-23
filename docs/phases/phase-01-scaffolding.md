# Phase 1 · Scaffolding

_Status: ✅ provided · last updated 2026-06-23_

## Goal

A running Next.js app with Tailwind, shadcn/ui, and the full folder structure in place.

## Prompt to paste

```text
TASK 1: Scaffold the project.
- Create a Next.js app (App Router, TypeScript, Tailwind, ESLint, src/ dir,
  import alias @/*).
- Install and init shadcn/ui. Add these components: button, table, input,
  card, badge, dialog, sheet, dropdown-menu, progress, sonner (toasts).
- Install runtime deps: @prisma/client prisma playwright p-queue sharp pdf-lib
  fast-xml-parser zod @tanstack/react-query.
- Install playwright chromium browser binary.
- Create the folder structure: src/lib, src/capture, src/worker, data/archive.
- Create src/lib/logger.ts: a tiny logger with info/warn/error that prints a
  timestamp + level + message + optional metadata object as JSON.
- Create src/lib/paths.ts: exports DATA_DIR, ARCHIVE_DIR, and a helper
  snapshotDir(projectId, snapshotId) and pageAssetPath(...) that build paths
  under data/archive. Create dirs if missing.
- Add .gitignore entries for data/, .env, node_modules, .next.
- Add package.json scripts: "dev" (next dev), "worker" (run src/worker/index.ts
  with tsx), "db:push" (prisma db push), "db:studio" (prisma studio).
- Install tsx as a dev dep for running the worker.

Then tell me the commands to run and what I should see.
```

## Task breakdown (workstream: Foundation & Tooling)

- [ ] **1.1** Create Next.js app — App Router, TypeScript, Tailwind, ESLint, `src/` dir, `@/*`
  alias.
- [ ] **1.2** Init shadcn/ui; add `button table input card badge dialog sheet dropdown-menu
  progress sonner`.
- [ ] **1.3** Install runtime deps: `@prisma/client prisma playwright p-queue sharp pdf-lib
  fast-xml-parser zod @tanstack/react-query`.
- [ ] **1.4** Install dev dep `tsx`.
- [ ] **1.5** Install the Playwright Chromium binary (`npx playwright install chromium`).
- [ ] **1.6** Create folders `src/lib`, `src/capture`, `src/worker`, `data/archive`.
- [ ] **1.7** Write `src/lib/logger.ts` — `info` / `warn` / `error` → `timestamp + level +
  message + optional metadata as JSON`.
- [ ] **1.8** Write `src/lib/paths.ts` — `DATA_DIR`, `ARCHIVE_DIR`, `snapshotDir(projectId,
  snapshotId)`, `pageAssetPath(...)`; create dirs if missing.
- [ ] **1.9** `.gitignore`: `data/`, `.env`, `node_modules`, `.next`.
- [ ] **1.10** `package.json` scripts: `dev`, `worker`, `db:push`, `db:studio`.

## Files this phase creates

- Project skeleton (Next.js App Router).
- `src/lib/logger.ts`
- `src/lib/paths.ts`
- `package.json` scripts
- `.gitignore`
- Empty folders: `src/capture`, `src/worker`, `data/archive`

> See [04 · Folder Structure](../04-folder-structure.md) for the responsibility of each file
> and the exact script table.

## Run & verify

```bash
npm run dev      # → http://localhost:3000 shows the default Next.js page
```

- [ ] `localhost:3000` renders the default page.
- [ ] The folder structure (`src/lib`, `src/capture`, `src/worker`, `data/archive`) exists.
- [ ] `src/lib/logger.ts` and `src/lib/paths.ts` exist and type-check.
- [ ] `.gitignore` excludes `data/`, `.env`, `node_modules`, `.next`.

## Debug / edge cases

- If Playwright's browser download fails, run `npx playwright install chromium` manually.
- On Apple Silicon / Linux, Playwright may need system libs: `npx playwright install-deps`.
- Confirm the `@/*` alias resolves (check `tsconfig.json` `paths`).
- `data/` must be gitignored **before** the first commit so the SQLite file and archive are
  never tracked.

## Definition of Done

- [ ] All tasks 1.1–1.10 complete.
- [ ] `npm run dev` serves the app.
- [ ] `tsc --noEmit` and `eslint` pass.
- [ ] Committed to git as a clean rollback point (e.g. `chore: scaffold next.js app + tooling`).
