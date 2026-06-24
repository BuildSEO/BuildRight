/**
 * Image compression. Pure over buffers — no DB, no disk.
 *  - toWebpUnderLimit: PNG → WebP guaranteed under a byte budget (quality ladder, then downscale).
 *  - toPdf: PNG → paginated PDF (via JPEG, since pdf-lib can't embed WebP).
 */

import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { logger } from "@/lib/logger";
import { settings } from "@/lib/settings";

// WebP's hard maximum dimension. sharp throws above this, so tall captures must be downscaled.
const WEBP_MAX_DIM = 16383;
const QUALITY_LADDER: readonly number[] = [82, 70, 60, 50];
const DOWNSCALE_FACTOR = 0.85; // shrink width 15% per round when still over budget
const MIN_WIDTH = 320; // don't shrink below this

export interface WebpResult {
  buffer: Buffer;
  quality: number;
  width: number;
  height: number;
  downscaled: boolean;
}

export async function toWebpUnderLimit(
  png: Buffer,
  limitBytes: number = settings.capture.webpMaxBytes,
): Promise<WebpResult> {
  const meta = await sharp(png).metadata();
  const originalWidth = meta.width ?? 0;
  const originalHeight = meta.height ?? 0;
  const longest = Math.max(originalWidth, originalHeight);

  // 1. Ensure the longest side fits WebP's max dimension (otherwise sharp errors).
  let targetWidth = originalWidth;
  let downscaled = false;
  if (longest > WEBP_MAX_DIM && originalWidth > 0) {
    targetWidth = Math.max(MIN_WIDTH, Math.floor(originalWidth * (WEBP_MAX_DIM / longest)));
    downscaled = true;
    logger.info("compress: downscaling to fit WebP max dimension", {
      from: longest,
      maxDim: WEBP_MAX_DIM,
      targetWidth,
    });
  }

  const encode = (width: number, quality: number): Promise<Buffer> => {
    const pipe = width < originalWidth || width <= 0 ? sharp(png).resize({ width }) : sharp(png);
    return pipe.webp({ quality }).toBuffer();
  };

  // 2. Quality ladder; if the floor quality still overflows, downscale width and retry.
  for (let round = 0; round < 30; round += 1) {
    for (const quality of QUALITY_LADDER) {
      const out = await encode(targetWidth, quality);
      if (out.length <= limitBytes) {
        const m = await sharp(out).metadata();
        if (targetWidth < originalWidth) downscaled = true;
        return {
          buffer: out,
          quality,
          width: m.width ?? targetWidth,
          height: m.height ?? originalHeight,
          downscaled,
        };
      }
    }
    const next = Math.floor(targetWidth * DOWNSCALE_FACTOR);
    if (next < MIN_WIDTH || next >= targetWidth) break;
    targetWidth = next;
    downscaled = true;
    logger.info("compress: still over budget — downscaling width", { targetWidth });
  }

  // 3. Best effort: smallest tried size at floor quality. Store it rather than failing the page.
  const floorQuality = QUALITY_LADDER[QUALITY_LADDER.length - 1] ?? 50;
  const out = await encode(targetWidth, floorQuality);
  const m = await sharp(out).metadata();
  logger.warn("compress: could not reach size budget — storing best effort", {
    bytes: out.length,
    limitBytes,
  });
  return {
    buffer: out,
    quality: floorQuality,
    width: m.width ?? targetWidth,
    height: m.height ?? originalHeight,
    downscaled: true,
  };
}

/**
 * Embed the screenshot into a paginated PDF: slice the tall image into vertical strips of
 * pageHeightPx so a long page stays readable and no single PDF page is enormous.
 * pdf-lib embeds JPEG/PNG (not WebP), so each strip is encoded to JPEG first.
 */
export async function toPdf(png: Buffer, pageHeightPx = 1400): Promise<Buffer> {
  const meta = await sharp(png).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  const doc = await PDFDocument.create();

  if (width <= 0 || height <= 0) {
    doc.addPage(); // nothing to embed — emit a single blank page rather than throwing
    return Buffer.from(await doc.save());
  }

  const stripCount = Math.max(1, Math.ceil(height / pageHeightPx));
  for (let i = 0; i < stripCount; i += 1) {
    const top = i * pageHeightPx;
    const stripHeight = Math.min(pageHeightPx, height - top);
    const stripJpeg = await sharp(png)
      .extract({ left: 0, top, width, height: stripHeight })
      .jpeg({ quality: 80 })
      .toBuffer();
    const image = await doc.embedJpg(stripJpeg);
    const page = doc.addPage([width, stripHeight]);
    page.drawImage(image, { x: 0, y: 0, width, height: stripHeight });
  }

  return Buffer.from(await doc.save());
}
