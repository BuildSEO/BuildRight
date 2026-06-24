/**
 * One-page orchestration: capture → compress → gzip → write files → persist the Page row.
 * Hardened with a per-page timeout and a never-throws contract so one bad page can't crash the
 * run or reject the p-queue.
 */

import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import type { BrowserContext } from "playwright";
import type { Page as PageRow } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { pageAssetPath, toArchiveRelative } from "@/lib/paths";
import { capturePage } from "@/capture/capture";
import { toWebpUnderLimit, toPdf } from "@/capture/compress";
import { settings } from "@/lib/settings";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function toMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Reject if the wrapped promise doesn't settle within `ms`, so one hung page can't stall the queue. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

export interface CaptureOnePageOptions {
  exportPdf?: boolean;
}

/**
 * Capture and persist ONE page. Resolves whether the page succeeded or failed — never rejects.
 * `projectId` is needed to build the on-disk path (the Page row only carries snapshotId).
 */
export async function captureOnePage(
  context: BrowserContext,
  page: PageRow,
  projectId: string,
  options: CaptureOnePageOptions = {},
): Promise<void> {
  const { exportPdf = false } = options;
  try {
    await db.page.updateMany({ where: { id: page.id }, data: { status: "capturing" } });

    // Capture with retry-with-backoff for transient failures (nav timeouts, flaky network).
    let cap: Awaited<ReturnType<typeof capturePage>> | null = null;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt <= settings.defaults.retries; attempt += 1) {
      try {
        cap = await withTimeout(
          capturePage(context, page.url),
          settings.capture.perPageTimeoutMs,
          `capture ${page.url}`,
        );
        break;
      } catch (e) {
        lastErr = e;
        if (attempt < settings.defaults.retries) {
          logger.warn("pipeline: capture failed — retrying", {
            url: page.url,
            attempt: attempt + 1,
            error: toMessage(e),
          });
          await sleep(settings.defaults.retryBackoffMs * (attempt + 1));
        }
      }
    }
    if (!cap) throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));

    const webp = await toWebpUnderLimit(cap.pngBuffer);
    const htmlGz = gzipSync(Buffer.from(cap.html, "utf8"));

    const webpAbs = pageAssetPath(projectId, page.snapshotId, page.id, "webp");
    writeFileSync(webpAbs, webp.buffer);
    const htmlAbs = pageAssetPath(projectId, page.snapshotId, page.id, "html.gz");
    writeFileSync(htmlAbs, htmlGz);

    let pdfRel: string | null = null;
    if (exportPdf) {
      const pdfAbs = pageAssetPath(projectId, page.snapshotId, page.id, "pdf");
      writeFileSync(pdfAbs, await toPdf(cap.pngBuffer));
      pdfRel = toArchiveRelative(pdfAbs);
    }

    await db.page.updateMany({
      where: { id: page.id },
      data: {
        status: "done",
        httpStatus: cap.httpStatus,
        title: cap.extracted.title,
        metaDescription: cap.extracted.metaDescription,
        canonical: cap.extracted.canonical,
        metaRobots: cap.extracted.metaRobots,
        h1: cap.extracted.h1,
        headings: JSON.stringify(cap.extracted.headings),
        schema: JSON.stringify(cap.extracted.schema),
        links: JSON.stringify(cap.extracted.links),
        wordCount: cap.extracted.wordCount,
        screenshotPath: toArchiveRelative(webpAbs),
        htmlGzPath: toArchiveRelative(htmlAbs),
        pdfPath: pdfRel,
        width: webp.width,
        height: webp.height,
        fileSizeBytes: webp.buffer.length,
        capturedAt: new Date(),
      },
    });
    logger.info("pipeline: page done", {
      url: page.url,
      httpStatus: cap.httpStatus,
      bytes: webp.buffer.length,
    });
  } catch (e) {
    const msg = toMessage(e);
    logger.error("pipeline: page failed", { url: page.url, snapshotId: page.snapshotId, error: msg });
    try {
      await db.page.updateMany({
        where: { id: page.id },
        data: { status: "failed", error: msg.slice(0, 500), capturedAt: new Date() },
      });
    } catch (e2) {
      logger.error("pipeline: could not mark page failed", { pageId: page.id, error: toMessage(e2) });
    }
  }
}
