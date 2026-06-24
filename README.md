# BuildRight — SEO Snapshot Tool

A local-first tool that captures a full-page screenshot + all SEO fields of every page on a site,
stores everything on disk, and lets you compare snapshots over time — so after a redesign you can
prove what changed and recover rankings.

Two processes: the **Next.js app** (UI + thin API) and a separate **worker** that does all the
Playwright capture. They talk only through SQLite. Full design docs live in [`docs/`](./docs).

## Prerequisites

- Node.js 22+
- macOS/Linux (Playwright Chromium is installed locally)

## Setup

```bash
npm install
npx playwright install chromium        # one-time browser download
cp .env.example .env                   # DATABASE_URL=file:../data/app.db
npm run db:push                        # create data/app.db
```

## Run it (two terminals)

```bash
# terminal 1 — web app + API
npm run dev            # http://localhost:3000

# terminal 2 — capture worker
npm run worker
```

Open http://localhost:3000 → create a project → **New snapshot** → pick **Whole site** or
**Single page** → watch the table fill in live → click a thumbnail for the full viewer.
The header warns if the worker isn't running.

```bash
npm run db:studio      # inspect the database
```

## Useful scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | web app + API |
| `npm run worker` | capture worker (long-running) |
| `npm run db:push` / `db:studio` | apply schema / inspect DB |
| `npm run typecheck` / `lint` | TypeScript + ESLint gates |
| `npm run test:unit` / `test:int` | unit + Chromium integration tests |
| `npx tsx scripts/test-discover.ts <url>` | try URL discovery on a domain |
| `npx tsx scripts/test-capture.ts <url>` | capture one page → `test.png` + JSON |

## Configuration (env, all optional)

Tunables live in `src/lib/settings.ts`; a few are overridable in `.env`:

| Var | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | `file:../data/app.db` | SQLite location (resolves to project-root `data/`) |
| `CAPTURE_CONCURRENCY` | `4` | pages captured in parallel (3–4 is the local sweet spot) |
| `CAPTURE_HEADLESS` | `true` | set `false` to run a visible browser (helps past soft bot-challenges) |
| `MAX_PAGES_DEFAULT` | `200` | default page cap for new snapshots |

## Back up your archive

**The `data/` folder is your entire archive** — `app.db` (all metadata) + `archive/` (screenshots,
gzipped HTML, PDFs). It's gitignored. To back up, copy it somewhere safe:

```bash
cp -R data ~/Backups/buildright-$(date +%Y%m%d)
```

Stopping the processes never deletes anything; restart them anytime and everything is exactly as you
left it.

## Running for a team (local network)

Build once and serve on the network, with a process manager keeping both alive:

```bash
npm run build
pm2 start "npm run start -- -H 0.0.0.0" --name buildright-web
pm2 start "npm run worker" --name buildright-worker
```

Teammates open `http://<machine-ip>:3000` (open the port on the host firewall). Back up `data/` on a
schedule.

## Notes & limits

- **Bot challenges:** the capture waits out soft "checking your browser" interstitials and shares one
  browser context per snapshot. It does **not** solve CAPTCHAs — for sites with hard protection, ask
  the owner to allowlist the capture (or set `CAPTURE_HEADLESS=false`).
- **Very tall pages** are clipped at 25,000px and WebP is downscaled to fit under 5 MB and within
  WebP's 16,383px max dimension.

## Scaling to the cloud (no rewrite)

The worker split is the same shape as the cloud target — see
[`docs/10-risks-and-scaling.md`](./docs/10-risks-and-scaling.md): SQLite→Postgres, p-queue→BullMQ+Redis,
`data/archive`→S3, one worker→many, plus auth + per-tenant scoping (every row already keys off a project).
