# Phase 3 · Page Discovery

_Status: ✅ provided · last updated 2026-06-23 · workstream: URL Discovery_

## Goal

Given a domain, produce a clean, deduped list of page URLs to capture.

## Prompt to paste

```text
TASK 3: Build src/capture/discover.ts.

Export: async function discoverUrls(domain: string, opts: { mode: "sitemap" |
"crawl"; maxPages: number }): Promise<string[]>

SITEMAP MODE:
- Normalize domain to a base origin (https://, no trailing slash).
- Fetch /robots.txt, parse any "Sitemap:" lines for sitemap URLs. If none,
  default to /sitemap.xml.
- Fetch each sitemap with fast-xml-parser. Handle BOTH a urlset (list of <url><loc>)
  AND a sitemapindex (list of nested <sitemap><loc>) — recurse into nested sitemaps.
- Collect all <loc> URLs.

CRAWL MODE (also the fallback if sitemap yields nothing):
- BFS starting from the homepage using fetch + a lightweight HTML parser to extract
  <a href>. Same-origin only. Respect maxPages.

FOR BOTH:
- Normalize URLs: strip #fragments, strip common tracking params (utm_*, fbclid,
  gclid), resolve relative to absolute, lowercase host, collapse trailing slashes
  consistently.
- Dedupe.
- Exclude obvious non-content: /wp-admin, /wp-login, mailto:, tel:, logout,
  file extensions like .pdf/.jpg/.zip (configurable list).
- Cap to maxPages.
- Wrap network calls in try/catch; if sitemap fetch fails, log a warning and
  fall back to crawl mode.

Write a tiny standalone test script scripts/test-discover.ts I can run with tsx
that calls discoverUrls on a domain I pass as an argument and prints the list
+ count.
```

## Task breakdown

- [ ] **3.1** `discoverUrls(domain, { mode, maxPages })` signature + origin normalization (force `https://`, drop trailing slash).
- [ ] **3.2** Sitemap discovery: fetch `/robots.txt`, parse `Sitemap:` lines; fall back to `/sitemap.xml`.
- [ ] **3.3** Sitemap parse with `fast-xml-parser`; detect `<urlset>` vs `<sitemapindex>`; **recurse** into nested sitemaps.
- [ ] **3.4** Handle gzipped sitemaps (`.xml.gz` → gunzip) — note explicitly.
- [ ] **3.5** Crawl fallback: BFS from homepage via `fetch` + a **lightweight HTML parser** for `<a href>`; same-origin only; respect `maxPages`. (No Playwright here.)
- [ ] **3.6** URL normalization (pure fn): strip `#fragments`; strip tracking params (`utm_*`, `fbclid`, `gclid`); resolve relative→absolute; lowercase host; collapse trailing slashes.
- [ ] **3.7** Dedupe; exclusion list (`/wp-admin`, `/wp-login`, `mailto:`, `tel:`, `logout`, `.pdf/.jpg/.zip`, …) as a **configurable constant**.
- [ ] **3.8** Cap to `maxPages`; wrap network in try/catch; sitemap failure → log warning → crawl fallback.
- [ ] **3.9** `scripts/test-discover.ts` (tsx, domain arg) prints the list + count.

## Files this phase creates

- `src/capture/discover.ts`
- `scripts/test-discover.ts`

> Design contract in [07 · Capture Pipeline](../07-capture-pipeline.md). Normalization is the highest-value **pure
> function** to unit-test ([09 · Testing](../09-testing-and-verification.md)).

## Run & verify

```bash
npx tsx scripts/test-discover.ts https://example.com
```

- [ ] Prints a deduped, normalized URL list with a count.
- [ ] On a WordPress/Yoast site (`/sitemap_index.xml`), recursion resolves nested sitemaps.

## Debug / edge cases

- **Sitemap index files** (sitemap-of-sitemaps) are common on real agency sites — confirm recursion works on a
  WordPress/Yoast site (they expose `/sitemap_index.xml`).
- **Gzipped sitemaps** (`.xml.gz`) exist — you may need to gunzip.
- **Crawl traps** (faceted search / calendar pages) can explode page counts — the `maxPages` cap and exclusion list are
  your guard.

## Dependencies

Foundation (Phase 1: `logger`) and ideally before the worker (Phase 6) wires it in. Independent of Playwright.

## Definition of Done

- [ ] Tasks 3.1–3.9 complete; `discoverUrls` is pure where possible (normalization split from network IO).
- [ ] `npx tsx scripts/test-discover.ts <domain>` prints a sensible deduped list.
- [ ] `tsc --noEmit` + `eslint` clean; try/catch + logger on every fetch.
- [ ] Committed (e.g. `feat(capture): sitemap-first URL discovery with crawl fallback`).
