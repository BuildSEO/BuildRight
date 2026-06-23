import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { toWebpUnderLimit, toPdf } from "@/capture/compress";

const WEBP_MAX_DIM = 16383;
const FIVE_MB = 5_000_000;

function solidPng(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 40, g: 80, b: 120 } } })
    .png()
    .toBuffer();
}

/** High-entropy image so WebP can't compress it to nothing (exercises the size ladder). */
function noisePng(width: number, height: number): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  let s = 123456789 >>> 0;
  for (let i = 0; i < raw.length; i += 1) {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    raw[i] = s & 0xff;
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

describe("toWebpUnderLimit", () => {
  it("returns a small image at top quality, not downscaled", async () => {
    const png = await solidPng(200, 200);
    const r = await toWebpUnderLimit(png);
    expect(r.buffer.length).toBeLessThanOrEqual(FIVE_MB);
    expect(r.quality).toBe(82);
    expect(r.downscaled).toBe(false);
    expect(r.width).toBe(200);
  });

  it("downscales a too-tall image to fit the WebP max dimension", async () => {
    const png = await solidPng(1000, 20000); // longest side 20000 > 16383
    const r = await toWebpUnderLimit(png);
    expect(r.downscaled).toBe(true);
    expect(Math.max(r.width, r.height)).toBeLessThanOrEqual(WEBP_MAX_DIM);
    expect(r.buffer.length).toBeLessThanOrEqual(FIVE_MB);
  });

  it("steps quality/size down under a tight byte budget", async () => {
    const png = await noisePng(600, 600);
    const big = await toWebpUnderLimit(png, 10_000_000); // unconstrained
    const small = await toWebpUnderLimit(png, 4000); // force the ladder + downscale
    expect(big.quality).toBe(82);
    expect(small.buffer.length).toBeLessThan(big.buffer.length);
    expect(small.downscaled || small.quality < 82).toBe(true);
  });
});

describe("toPdf", () => {
  it("paginates a tall image into one page per strip", async () => {
    const png = await solidPng(800, 3000); // 3000 / 1400 -> 3 pages
    const pdf = await toPdf(png, 1400);
    expect(pdf.subarray(0, 4).toString("latin1")).toBe("%PDF");
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(3);
  });

  it("emits a single page for a short image", async () => {
    const png = await solidPng(800, 500);
    const doc = await PDFDocument.load(await toPdf(png, 1400));
    expect(doc.getPageCount()).toBe(1);
  });
});
