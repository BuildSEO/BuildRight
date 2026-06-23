# 05 · Conventions & Coding Rules

> Status: **active standard** · Last updated: 2026-06-23
> These are the canonical Phase 0 rules, expanded into an actionable engineering standard. **Every phase obeys this document.** When a future phase doc conflicts with this file, this file wins unless the conflict is explicitly called out and this file is updated in the same PR.

This is the contract every contributor (human or agent) follows while building the SEO Snapshot Tool. It is deliberately checklist-heavy so it can be followed verbatim.

**Related docs:** [Architecture](./03-architecture.md) · [Scaffolding (Phase 1)](./phases/phase-01-scaffolding.md) · [Data model (Phase 2)](./06-data-model.md) · [Capture pipeline](./07-capture-pipeline.md)

---

## 0. TL;DR — the rules in one screen

- [ ] TypeScript `strict` + extra safety flags on; **no `any`** (justify in a comment on the rare exception).
- [ ] Small, single-responsibility modules. **Pure logic separated from IO** so `discover` / `capture` / `compress` unit-test in isolation.
- [ ] **Every** network / browser / disk op is wrapped in `try/catch`, logged, and either rethrown or recorded as `failed`. Never swallow.
- [ ] Log through `src/lib/logger.ts`. **`console.log` is banned** in `src/worker/**` and `src/capture/**`.
- [ ] **Validate every API input with zod.** Validate **env with zod** at startup.
- [ ] **No secrets in code.** Everything sensitive comes from `.env`.
- [ ] Import via the `@/*` alias. No deep relative `../../../` chains.
- [ ] Each task ends with: **files changed → run command → how to verify**.
- [ ] **Don't build future phases ahead of time.** Only the asked task.
- [ ] Commit after every phase that passes its verify step, using the conventional-commit format below.

---

## 1. TypeScript strict settings

### 1.1 Required `tsconfig.json` compiler flags

The scaffolding (Phase 1) ships `strict: true`. We tighten it further. The `compilerOptions` block must contain at least:

```jsonc
{
  "compilerOptions": {
    // --- correctness floor ---
    "strict": true,                        // enables strictNullChecks, noImplicitAny, etc.
    "noUncheckedIndexedAccess": true,      // arr[i] / obj[k] is T | undefined — forces a guard
    "noImplicitOverride": true,            // subclass overrides must say `override`
    "noFallthroughCasesInSwitch": true,    // every case breaks/returns or is explicit
    "noImplicitReturns": true,             // all code paths return
    "exactOptionalPropertyTypes": true,    // `x?: T` is not the same as `x: T | undefined`
    "noPropertyAccessFromIndexShim": false,
    "useUnknownInCatchVariables": true,    // `catch (e)` => e is unknown, not any
    "forceConsistentCasingInFileNames": true,

    // --- module / build hygiene (Next.js App Router defaults) ---
    "module": "esnext",
    "moduleResolution": "bundler",
    "target": "es2022",
    "verbatimModuleSyntax": true,          // explicit `import type` for type-only imports
    "isolatedModules": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,

    // --- path alias (see §6) ---
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

> `noUncheckedIndexedAccess` is the highest-value flag for this codebase: discovery returns arrays of URLs and we index into parsed sitemap/heading structures constantly. It forces us to handle the "missing" case instead of trusting the index.

### 1.2 The no-`any` policy

- [ ] `any` is **forbidden** by default. Prefer `unknown` and narrow it.
- [ ] For external/untyped data (parsed XML, scraped DOM, JSON-LD blobs) the entry type is `unknown`; convert to a real type via a **zod schema** (`schema.parse` / `schema.safeParse`), not a cast.
- [ ] If `any` is genuinely unavoidable (e.g., a broken upstream type), it must:
  - be the **narrowest possible scope** (one expression, never a whole function), and
  - carry an inline comment `// any: <reason>` explaining why it cannot be typed.
- [ ] `as` casts are a code smell. Allowed only for: `as const`, satisfying a discriminated union after a proven narrow, or `expr satisfies T` (preferred over `as T`). Never `as unknown as T` to silence the compiler.
- [ ] ESLint enforces this: `@typescript-eslint/no-explicit-any: "error"`.

### 1.3 Type style

- [ ] Prefer `type` aliases for unions/envelopes; `interface` for object shapes that may be extended.
- [ ] Status fields are **string literal unions**, not bare `string`, in TS even though SQLite stores them as `String`:
  ```ts
  export type SnapshotStatus = "queued" | "discovering" | "capturing" | "done" | "failed";
  export type PageStatus = "queued" | "capturing" | "done" | "failed";
  export type Discovery = "sitemap" | "crawl";
  ```
  These live in one shared module (e.g. `src/lib/types.ts`) and are reused by the worker, API, and UI so a status typo is a compile error. See [Data model](./06-data-model.md).
- [ ] Exported functions have explicit return types. Inferred returns are fine for local/private helpers.

---

## 2. Module design

### 2.1 Single responsibility

- [ ] One module = one job. The target layout already encodes this: `discover.ts` finds URLs, `capture.ts` drives Playwright + extracts fields, `compress.ts` does WebP/PDF, `pipeline.ts` orchestrates one page. Do not blur these.
- [ ] Keep files small. If a file passes ~200 lines or grows a second clear responsibility, split it.
- [ ] No circular imports. `lib` depends on nothing in `capture`/`worker`; `capture` may depend on `lib`; `worker` orchestrates `capture` + `lib`; `app` (API/UI) depends on `lib` and writes DB rows but **never imports from `capture`/`worker`** (the API never runs Playwright — see [Architecture](./03-architecture.md)).

```
app  ─┐
      ├─►  lib  ◄─── capture ◄─── worker
(API/UI writes queued rows only)
```

### 2.2 Pure functions, IO at the edges

The capture subsystem must be unit-testable without a network, a browser, or a disk. Achieve this by separating **decisions** (pure) from **effects** (IO):

- [ ] Pure, side-effect-free, fully unit-testable (given input → deterministic output, no globals, no clock, no fs):
  - sitemap XML string → `string[]` of URLs
  - raw HTML / DOM snapshot → extracted SEO fields (title, meta, canonical, robots, headings, JSON-LD, links, word count)
  - link classification (internal vs external) given a base origin
  - filename / path derivation given ids (delegated to `paths.ts`)
- [ ] Effectful, kept thin and at the edges (a wrapper that calls a pure core):
  - `fetch` of a sitemap / page
  - Playwright navigation + screenshot
  - `sharp` encode, `pdf-lib` write, gzip, `fs` writes
- [ ] Pattern: an effectful function fetches bytes, then hands them to a pure function. Example shape:
  ```ts
  // pure — unit-tested with fixture strings, no IO
  export function parseSitemap(xml: string): string[] { /* ... */ }

  // effectful — thin wrapper, try/catch + logger (see §3)
  export async function fetchSitemap(url: string): Promise<string[]> {
    const xml = await getText(url);     // IO
    return parseSitemap(xml);           // pure
  }
  ```
- [ ] Inject IO dependencies where it makes testing easier (pass a `fetch`-like fn or a Playwright `page` in, rather than constructing one inside the pure core).

### 2.3 Determinism

- [ ] No hidden globals or module-level mutable state in capture logic (other than the Prisma singleton and the logger).
- [ ] Read "now" and randomness only at the IO edge, never inside pure functions, so tests are stable.

---

## 3. Error handling

The product's whole value is a trustworthy archive, so a silently-dropped page or screenshot is the worst possible bug. Rules:

### 3.1 Wrap every external op

- [ ] **Every** network call, Playwright call, and disk op is inside a `try/catch`. No exceptions.
- [ ] **Never** swallow: an empty `catch {}`, or a `catch` that only `return null`s without logging, is a defect.
- [ ] `catch (e)` gives `e: unknown` (we set `useUnknownInCatchVariables`). Normalize it before use with a helper:
  ```ts
  export function toError(e: unknown): Error {
    return e instanceof Error ? e : new Error(String(e));
  }
  ```

### 3.2 Two legal reactions: rethrow vs mark-failed

Decide per layer:

| Layer | On error | Why |
| --- | --- | --- |
| Pure functions (`parseSitemap`, extractors) | `throw` a typed error | Caller decides; keeps them pure & testable |
| Per-page work in `pipeline.ts` | **log + mark `Page.status = "failed"`** and write `Page.error` | One bad page must not kill the whole snapshot |
| Snapshot-level fatal (bad domain, discovery total failure) | **log + mark `Snapshot.status = "failed"`** and write `Snapshot.error` | The run is unrecoverable; surface it in the UI |
| `src/lib/*` utilities | **log + rethrow** | They don't own job state; the caller does |
| Worker top-level loop | **log + continue** | The loop must survive a single job blowing up and keep polling |

- [ ] Rule of thumb: **log-and-rethrow** when you don't own the job row; **log-and-mark-failed** when you do.
- [ ] Errors written to the DB (`Snapshot.error` / `Page.error`) are short human-readable strings (message + a code), never a full stack. Full stacks go to the logger.

### 3.3 Typed error envelope

For results that can fail without being exceptional (e.g. one page in a batch), prefer returning a typed result over throwing across the pure/effect boundary:

```ts
export type Ok<T> = { ok: true; value: T };
export type Err = { ok: false; error: { code: string; message: string; cause?: unknown } };
export type Result<T> = Ok<T> | Err;
```

- [ ] Use `Result<T>` for "expected failure" paths (a page 404s, a sitemap is missing). Reserve `throw` for programmer errors and truly unexpected states.
- [ ] Error `code`s are stable string constants (e.g. `"SITEMAP_NOT_FOUND"`, `"NAV_TIMEOUT"`, `"SCREENSHOT_FAILED"`, `"COMPRESS_FAILED"`) so they can be matched and surfaced consistently.

---

## 4. Logging

### 4.1 The `src/lib/logger.ts` contract

- [ ] Exactly three levels: `info`, `warn`, `error`.
- [ ] Signature: `level(message: string, meta?: Record<string, unknown>): void`.
- [ ] Each line is emitted with **timestamp + level + message + optional meta as JSON**. Suggested shape:
  ```ts
  type Level = "info" | "warn" | "error";

  function log(level: Level, message: string, meta?: Record<string, unknown>): void {
    const line = {
      ts: new Date().toISOString(),     // 2026-06-23T...
      level,
      message,
      ...(meta ? { meta } : {}),
    };
    // single structured line to stdout (warn/error to stderr)
    (level === "info" ? process.stdout : process.stderr).write(JSON.stringify(line) + "\n");
  }

  export const logger = {
    info: (m: string, meta?: Record<string, unknown>) => log("info", m, meta),
    warn: (m: string, meta?: Record<string, unknown>) => log("warn", m, meta),
    error: (m: string, meta?: Record<string, unknown>) => log("error", m, meta),
  };
  ```
- [ ] `meta` is always an object so logs stay greppable / machine-parseable (cloud-ready: this is the seam where we later swap in pino/structured shipping).

### 4.2 Usage rules

- [ ] **`console.log` / `console.error` are banned in `src/worker/**` and `src/capture/**`.** Use `logger`. Enforced by ESLint `no-console` scoped to those paths.
- [ ] Include identifying `meta` on worker/capture logs: `{ snapshotId, pageId, url }` so a log line is traceable to a row.
- [ ] Log **every** caught error at `error` (or `warn` if it's an expected, handled miss). One error = one log line, at the point you decide rethrow vs mark-failed.
- [ ] Do not log secrets, full HTML bodies, or screenshot bytes. Log sizes/paths/counts instead.
- [ ] `console.*` is tolerated only in throwaway one-off scripts that never ship, and never inside `worker`/`capture`.

---

## 5. Validation, env, and secrets

### 5.1 zod at every API boundary

- [ ] Every API route handler parses its input (`body`, `params`, `searchParams`) with a zod schema **before** any logic. Reject with `400` + a clear message on failure.
- [ ] Pattern:
  ```ts
  const CreateSnapshot = z.object({
    projectId: z.string().cuid(),
    label: z.string().min(1).max(200).optional(),
    discovery: z.enum(["sitemap", "crawl"]).default("sitemap"),
    maxPages: z.number().int().positive().max(1000).default(200),
  });

  const parsed = CreateSnapshot.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  ```
- [ ] Also validate **untrusted external data** with zod: parsed sitemap XML shape and JSON-LD blocks are `unknown` → schema-parse, don't cast.
- [ ] Infer TS types from schemas (`z.infer<typeof X>`) so the validator and the type can never drift.

### 5.2 zod-validated env loader

- [ ] Env is read in **one** module (e.g. `src/lib/env.ts`), validated with zod at process start, and exported as a typed object. Nothing else reads `process.env` directly.
  ```ts
  const Env = z.object({
    DATABASE_URL: z.string().min(1),        // "file:./data/app.db"
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    // capture knobs get added in their phase, not before (see §8)
  });
  export const env = Env.parse(process.env);  // throws loudly at boot if misconfigured
  ```
- [ ] Failing fast at boot beats a `undefined` blowing up mid-capture.

### 5.3 Secrets

- [ ] **No secrets, tokens, or absolute machine paths in source.** They come from `.env`.
- [ ] `.env` is gitignored (Phase 1). Maintain a committed `.env.example` listing every key with placeholder values.
- [ ] Disk paths come from `src/lib/paths.ts` (`DATA_DIR`, `ARCHIVE_DIR`, `snapshotDir`, `pageAssetPath`), never hardcoded string-concatenated paths.

---

## 6. Imports, naming, and file organization

### 6.1 The `@/*` alias

- [ ] Import app code via `@/*` (configured in `tsconfig` §1.1 and in Next/ESLint resolver). Example: `import { logger } from "@/lib/logger";`.
- [ ] Use the alias for any cross-directory import. Plain relative imports (`./sibling`) are fine only within the same directory.
- [ ] **No `../../..` chains** — if you're reaching up two or more levels, use `@/`.
- [ ] Use `import type { … }` for type-only imports (`verbatimModuleSyntax` enforces it).

### 6.2 Naming

| Thing | Convention | Example |
| --- | --- | --- |
| Files / folders | `kebab-case` (or single word) | `discover.ts`, `paths.ts` |
| React components / files | `PascalCase` component, file matches | `SnapshotTable.tsx` |
| Variables / functions | `camelCase` | `parseSitemap`, `donePages` |
| Types / interfaces / enums | `PascalCase` | `SnapshotStatus`, `Result` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_PAGES`, `WEBP_MAX_BYTES` |
| Booleans | `is/has/should` prefix | `isInternal`, `hasSitemap` |
| Async functions | verb that implies IO | `fetchSitemap`, `capturePage` |
| Error codes | `UPPER_SNAKE_CASE` string | `"NAV_TIMEOUT"` |

- [ ] Match DB field names exactly when mapping rows (`metaDescription`, `htmlGzPath`, `wordCount`) — don't invent synonyms.

### 6.3 Folder organization (target)

```
prisma/schema.prisma
src/lib/        db.ts · logger.ts · paths.ts · env.ts · types.ts · errors.ts
src/capture/    discover.ts · capture.ts · compress.ts · pipeline.ts
src/worker/     index.ts
src/app/        api/… (route handlers) · UI pages
data/           app.db · archive/   (both gitignored)
```

- [ ] New code goes in the directory that matches its responsibility. Don't create new top-level dirs without updating [Architecture](./03-architecture.md).

---

## 7. Definition of Done (per task)

A task is not finished until all three are stated explicitly in the hand-off (this mirrors Phase 0):

- [ ] **Files changed** — exact list of created/modified paths.
- [ ] **Run command** — the precise command(s) to run the result (e.g. `npm run db:push`, `npm run worker`, `npm run dev`).
- [ ] **How to verify** — a concrete, observable check that proves it worked (expected log line, a row in `db:studio`, a file appearing under `data/archive/`, an HTTP response).

Plus the standing gates:

- [ ] `npx tsc --noEmit` passes (no type errors).
- [ ] `npm run lint` passes (ESLint clean, no `any`, no stray `console` in worker/capture).
- [ ] `npm run format:check` (Prettier) clean.
- [ ] Any pure function added has at least one unit test (or a stated reason it's deferred).

> Template for the hand-off note:
> ```
> Files: <paths>
> Run: <command>
> Verify: <observable result>
> ```

---

## 8. Don't build ahead

- [ ] Implement **only** the asked task / current phase. Do not stub, scaffold, or implement Phases not yet specified.
- [ ] Phases 3–12 are **not yet defined.** Do not invent their contents. Forward-looking *design notes* in docs are welcome (and expected) but must be framed as **planned / design**, never as **built**.
- [ ] Adding config keys, schema columns, or modules "because we'll need them later" is a violation. Add them in the phase that uses them.
- [ ] If a task seems to require future work, stop and flag it rather than building speculatively.

---

## 9. Git discipline

- [ ] Work on a branch, never commit directly to the default branch.
- [ ] **Commit after every phase that passes its verify step.** One coherent, working commit per phase (small intra-phase commits are fine; each must compile).
- [ ] Never commit `data/`, `.env`, `node_modules`, or `.next` (Phase 1 `.gitignore` covers these — keep it that way).
- [ ] Commit messages follow **Conventional Commits**:

  ```
  <type>(<scope>): <imperative summary>

  <optional body: what & why, not how>
  ```

  | type | use for |
  | --- | --- |
  | `feat` | new user-facing capability |
  | `fix` | bug fix |
  | `chore` | tooling, deps, scaffolding |
  | `refactor` | behavior-preserving restructure |
  | `docs` | docs only |
  | `test` | tests only |

  Suggested scopes: `scaffold`, `db`, `capture`, `worker`, `api`, `ui`, `lib`, `docs`.

  Examples:
  ```
  chore(scaffold): init Next.js app, shadcn/ui, runtime deps  (Phase 1)
  feat(db): add Project/Snapshot/Page schema + Prisma singleton  (Phase 2)
  feat(capture): sitemap-first URL discovery with crawl fallback
  ```

- [ ] Reference the phase number in the body or summary so history maps to the plan.

---

## 10. Lint & format (intent)

- [ ] **ESLint** = correctness. Base on `next/core-web-vitals` + `@typescript-eslint` (type-aware). Required rules:
  - `@typescript-eslint/no-explicit-any: "error"`
  - `@typescript-eslint/no-floating-promises: "error"` (async capture work must be awaited)
  - `@typescript-eslint/no-unused-vars: "error"` (allow `_`-prefixed)
  - `no-console: "error"` scoped via an `overrides` block to `src/worker/**` and `src/capture/**`
  - `eqeqeq: "error"`, `no-restricted-imports` to block `process.env` outside `src/lib/env.ts`
- [ ] **Prettier** = formatting (single source of truth; ESLint does not fight it). Intent: 2-space indent, double quotes, semicolons, trailing commas (`all`), width 100. Commit a `.prettierrc` and `.prettierignore` (ignore `data/`, `.next/`).
- [ ] Scripts: `lint` (`next lint`), `format` (`prettier --write .`), `format:check` (`prettier --check .`). These run in the Definition of Done (§7).
- [ ] Formatting churn never rides in a feature commit — format in its own `chore` commit if needed.

---

## 11. Quick self-review checklist (paste before every hand-off)

- [ ] No `any` (or each is commented & scoped).
- [ ] Every network/browser/disk op is in `try/catch` and logged.
- [ ] No `console.*` in `worker`/`capture`.
- [ ] All API inputs zod-validated; env zod-validated; no secrets in code.
- [ ] Pure logic split from IO; new pure fns have tests.
- [ ] Imports use `@/*`; no `../../..`.
- [ ] `tsc --noEmit`, `lint`, `format:check` all green.
- [ ] Hand-off states files changed + run command + verify.
- [ ] Only the asked phase was built — nothing speculative.
- [ ] Committed with a conventional-commit message referencing the phase.
