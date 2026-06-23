# Phase 5 · Compression (WebP under 5 MB + PDF)

_Status: ✅ provided · last updated 2026-06-23 · workstream: Compression & Export_

## Goal

Turn the big PNG into a clear WebP under 5 MB, and optionally a paginated PDF.

## Prompt to paste

```text
TASK 5: Build src/capture/compress.ts.

Export: async function toWebpUnderLimit(png: Buffer, limitBytes = 5_000_000):
Promise<{ buffer: Buffer; quality: number }>
- Encode with sharp().webp({ quality }) starting at quality 82.
- If the result is over limitBytes, step quality down (82 -> 70 -> 60 -> 50) and
  re-encode. If still over at 50, downscale the image width by 15% and retry the
  quality ladder. Return the first buffer under the limit (and the quality used).
  Log if it had to downscale.

Export: async function toPdf(png: Buffer, pageHeightPx = 1400): Promise<Buffer>
- Use pdf-lib. Convert the PNG to JPEG via sharp first (pdf-lib embeds JPEG/PNG,
  not WebP). Slice the tall image into vertical strips of pageHeightPx and add one
  PDF page per strip so a long page stays readable and the file stays reasonable.
  Return the PDF bytes.

Add to scripts/test-capture.ts (or a new script) a step that runs the PNG through
both and reports final file sizes. Confirm the WebP is < 5 MB and visually clear.
```

## Task breakdown

- [ ] **5.1** `toWebpUnderLimit(png, limitBytes = 5_000_000)` → `{ buffer, quality }` using `sharp().webp({ quality })` starting at **82**.
- [ ] **5.2** Quality ladder **82 → 70 → 60 → 50**, re-encoding until under `limitBytes`.
- [ ] **5.3** If still over at 50, **downscale width 15%** and retry the ladder; return the first buffer under the limit; **log** when downscaled.
- [ ] **5.4** Best-effort fallback: if even downscale+q50 can't hit the limit, **log and store best effort** — never fail the whole capture.
- [ ] **5.5** `toPdf(png, pageHeightPx = 1400)` → `Buffer`: convert PNG→**JPEG** via sharp first (pdf-lib can't embed WebP), slice into vertical strips of `pageHeightPx`, one PDF page per strip.
- [ ] **5.6** Handle the **WebP 16383px max-dimension** limit for very tall pages (tile into stacked WebP tiles, or cap capture height — tie to the 25000px cap from Phase 4). Note explicitly.
- [ ] **5.7** Extend `scripts/test-capture.ts` (or a new script) to run the PNG through both and report final sizes.

## Files this phase creates

- `src/capture/compress.ts`

> Design contract: [07 · Capture Pipeline §4](../07-capture-pipeline.md). Pure over buffers → easiest module to unit-test
> ([09 · Testing §4.2](../09-testing-and-verification.md)). WebP/quality risk details in
> [10 · Risks R3](../10-risks-and-scaling.md).

## Run & verify

- [ ] The WebP from a long landing page is **under 5 MB** and text is still readable.
- [ ] The PDF opens and is **paginated** (one page per `pageHeightPx` strip).
- [ ] The size-report step prints WebP + PDF byte sizes.

## Debug / edge cases

- **WebP max dimension is 16383px.** Very tall pages exceed it — sharp will error. Handle by splitting the image into
  stacked WebP tiles, or by capping capture height (tie this to the 25000px cap from Phase 4). Note the limit explicitly.
- If quality 50 + downscale still can't hit 5 MB, the page is enormous — **log it and store the best effort** rather than
  failing the whole capture.

## Dependencies

Consumes Phase 4's PNG buffer. Independent of discovery. Used by Phase 6's pipeline.

## Definition of Done

- [ ] Tasks 5.1–5.7 complete; both functions pure over buffers (no DB/disk).
- [ ] WebP under 5 MB on a tall page; PDF paginates; 16383px case handled.
- [ ] `tsc --noEmit` + `eslint` clean; downscale/best-effort paths logged.
- [ ] Committed (e.g. `feat(capture): webp-under-5mb compression + paginated pdf`).
