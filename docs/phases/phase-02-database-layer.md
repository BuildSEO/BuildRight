# Phase 2 · Database Layer

_Status: ✅ provided · last updated 2026-06-23_

## Goal

The full data model in SQLite via Prisma. This is the spine everything else hangs off.

## Prompt to paste

```text
TASK 2: Build the database layer with Prisma + SQLite.

Create prisma/schema.prisma with datasource provider = "sqlite", url from env
DATABASE_URL (set it to "file:./data/app.db" in .env).

Models:

Project
  id          String   @id @default(cuid())
  name        String
  domain      String
  createdAt   DateTime @default(now())
  snapshots   Snapshot[]

Snapshot   // one capture run of a whole site at a point in time
  id          String   @id @default(cuid())
  projectId   String
  project     Project  @relation(...)
  label       String?  // e.g. "pre-redesign"
  status      String   @default("queued") // queued|discovering|capturing|done|failed
  discovery   String   @default("sitemap") // sitemap|crawl
  maxPages    Int      @default(200)
  totalPages  Int      @default(0)
  donePages   Int      @default(0)
  error       String?
  createdAt   DateTime @default(now())
  finishedAt  DateTime?
  pages       Page[]

Page
  id              String   @id @default(cuid())
  snapshotId      String
  snapshot        Snapshot @relation(...)
  url             String
  status          String   @default("queued") // queued|capturing|done|failed
  httpStatus      Int?
  title           String?
  metaDescription String?
  canonical       String?
  metaRobots      String?
  h1              String?      // primary H1 (store all headings as JSON in headings)
  headings        String?      // JSON: {h1:[],h2:[],...}
  schema          String?      // JSON: array of JSON-LD blocks found
  links           String?      // JSON: [{href, anchor, internal}]
  wordCount       Int?
  screenshotPath  String?      // relative path to .webp
  pdfPath         String?      // relative path to .pdf (optional)
  htmlGzPath      String?      // relative path to gzipped raw html
  width           Int?
  height          Int?
  fileSizeBytes   Int?
  error           String?
  capturedAt      DateTime?

  @@index([snapshotId])
  @@unique([snapshotId, url])

Also create src/lib/db.ts exporting a singleton PrismaClient (guard against
hot-reload creating multiple clients in dev).

Run prisma db push to create the database. Confirm the tables exist by opening
prisma studio. Tell me both commands.
```

## Task breakdown (workstream: Data & Storage)

- [ ] **2.1** Add `.env` with `DATABASE_URL="file:./data/app.db"`.
- [ ] **2.2** Write `prisma/schema.prisma` — datasource `sqlite`, `Project` / `Snapshot` /
  `Page` models exactly as specified, with `@@index([snapshotId])` and
  `@@unique([snapshotId, url])` on `Page`.
- [ ] **2.3** Write `src/lib/db.ts` — singleton `PrismaClient` with the dev hot-reload guard.
- [ ] **2.4** Run `npm run db:push` to create `data/app.db`.
- [ ] **2.5** Open `npm run db:studio` and confirm the three empty tables.

## Files this phase creates

- `prisma/schema.prisma`
- `src/lib/db.ts`
- `.env`

> The schema, state machines, JSON-string rationale, and on-disk storage layout are detailed
> in [06 · Data Model](../06-data-model.md).

## Run & verify

```bash
npm run db:push    # creates data/app.db from the schema
npm run db:studio  # opens Prisma Studio in the browser
```

- [ ] Prisma Studio shows `Project`, `Snapshot`, and `Page` tables, all empty.
- [ ] `data/app.db` exists (and is gitignored).
- [ ] `src/lib/db.ts` type-checks and exports a single client.

## Debug / edge cases

- **Why JSON-in-string for `headings` / `schema` / `links`?** SQLite has no native array type.
  When migrating to Postgres later, switch these to `Json` columns — Prisma makes it painless.
- **`@@unique([snapshotId, url])`** prevents duplicate captures of the same URL within one
  snapshot — important once the crawler runs and can rediscover the same URL.
- The hot-reload guard in `db.ts` prevents Next.js dev from opening many SQLite connections,
  which would otherwise cause locking errors.
- Ensure `data/` exists before `db:push` (Phase 1's `paths.ts` / `.gitignore` should already
  account for it).

## Definition of Done

- [ ] All tasks 2.1–2.5 complete.
- [ ] `db:push` succeeds and `db:studio` shows the three empty tables.
- [ ] `tsc --noEmit` and `eslint` pass.
- [ ] Committed to git (e.g. `feat(db): prisma schema + sqlite + client singleton`).
