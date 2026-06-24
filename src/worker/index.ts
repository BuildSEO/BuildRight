/**
 * The capture worker: a long-running process that turns queued Snapshots into captured Pages.
 *
 * Loop: claim oldest queued Snapshot → discover URLs (once) → capture every queued page through
 * a bounded p-queue → finalize. One Chromium instance, one context per page (in capturePage).
 * Enables SQLite WAL, resumes snapshots left mid-flight by a crash, and shuts down gracefully.
 */

import PQueue from "p-queue";
import { chromium, type Browser } from "playwright";
import type { Project, Snapshot } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { discoverUrls } from "@/capture/discover";
import { captureOnePage } from "@/capture/pipeline";
import { createCaptureContext } from "@/capture/capture";

const POLL_INTERVAL_MS = 3_000;
const CAPTURE_CONCURRENCY = 4; // 3–4 is the local sweet spot; higher risks OOM on tall pages

type SnapshotWithProject = Snapshot & { project: Project };

let shuttingDown = false;
let browser: Browser | null = null;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const toMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

async function enableWal(): Promise<void> {
  try {
    // PRAGMA journal_mode / busy_timeout RETURN a row, so use queryRaw (executeRaw forbids results).
    const mode = await db.$queryRawUnsafe("PRAGMA journal_mode=WAL;");
    await db.$queryRawUnsafe("PRAGMA busy_timeout=5000;");
    logger.info("worker: WAL enabled", { mode });
  } catch (e) {
    logger.warn("worker: could not enable WAL", { error: toMessage(e) });
  }
}

/** Re-queue snapshots/pages left mid-flight by a previous crash so the next run resumes them. */
async function resumeStuckSnapshots(): Promise<void> {
  const stuck = await db.snapshot.findMany({ where: { status: { in: ["discovering", "capturing"] } } });
  for (const s of stuck) {
    await db.page.updateMany({ where: { snapshotId: s.id, status: "capturing" }, data: { status: "queued" } });
    await db.snapshot.update({ where: { id: s.id }, data: { status: "queued" } });
    logger.info("worker: re-queued stuck snapshot for resume", { snapshotId: s.id });
  }
}

/** Atomically claim the oldest queued snapshot (guards against double-claim). */
async function claimNextSnapshot(): Promise<SnapshotWithProject | null> {
  const next = await db.snapshot.findFirst({ where: { status: "queued" }, orderBy: { createdAt: "asc" } });
  if (!next) return null;
  const claim = await db.snapshot.updateMany({
    where: { id: next.id, status: "queued" },
    data: { status: "discovering" },
  });
  if (claim.count === 0) return null; // another worker won the race
  return db.snapshot.findUnique({ where: { id: next.id }, include: { project: true } });
}

/** Current snapshot status, or null if it no longer exists (e.g. deleted mid-run). */
async function snapshotStatus(snapshotId: string): Promise<string | null> {
  const s = await db.snapshot.findUnique({ where: { id: snapshotId }, select: { status: true } });
  return s?.status ?? null;
}

/** Run one snapshot end-to-end. Discovery runs only if the snapshot has no pages yet (resume-safe). */
export async function runSnapshot(snapshot: SnapshotWithProject, activeBrowser: Browser): Promise<void> {
  try {
    const existing = await db.page.count({ where: { snapshotId: snapshot.id } });
    if (existing === 0) {
      const mode = snapshot.discovery === "crawl" ? "crawl" : "sitemap";
      logger.info("worker: discovering", { snapshotId: snapshot.id, domain: snapshot.project.domain, mode });
      const urls = await discoverUrls(snapshot.project.domain, { mode, maxPages: snapshot.maxPages });
      if (urls.length === 0) throw new Error("no URLs discovered");
      await db.page.createMany({ data: urls.map((url) => ({ snapshotId: snapshot.id, url })) });
    } else {
      logger.info("worker: resuming snapshot with existing pages", { snapshotId: snapshot.id, existing });
    }

    const preStatus = await snapshotStatus(snapshot.id);
    if (preStatus === null || preStatus === "stopped") {
      logger.info("worker: snapshot gone or stopped before capture", {
        snapshotId: snapshot.id,
        status: preStatus,
      });
      return;
    }

    const total = await db.page.count({ where: { snapshotId: snapshot.id } });
    const alreadyDone = await db.page.count({
      where: { snapshotId: snapshot.id, status: { in: ["done", "failed"] } },
    });
    await db.snapshot.update({
      where: { id: snapshot.id },
      data: { status: "capturing", totalPages: total, donePages: alreadyDone },
    });

    const queued = await db.page.findMany({ where: { snapshotId: snapshot.id, status: "queued" } });
    logger.info("worker: capturing", {
      snapshotId: snapshot.id,
      total,
      toCapture: queued.length,
      concurrency: CAPTURE_CONCURRENCY,
    });

    // One context per snapshot: a bot-challenge clearance cookie is solved once, then shared.
    const context = await createCaptureContext(activeBrowser);
    try {
      const queue = new PQueue({ concurrency: CAPTURE_CONCURRENCY });
      for (const pageRow of queued) {
        if (shuttingDown) break;
        void queue.add(async () => {
          const st = await snapshotStatus(snapshot.id);
          if (st === null || st === "stopped") return; // deleted or stopped — skip remaining pages
          await captureOnePage(context, pageRow, snapshot.projectId);
          // updateMany tolerates the snapshot being deleted mid-run (no-op instead of throwing).
          await db.snapshot.updateMany({ where: { id: snapshot.id }, data: { donePages: { increment: 1 } } });
        });
      }
      await queue.onIdle();
    } finally {
      await context.close().catch(() => undefined);
    }

    if (shuttingDown) {
      logger.info("worker: shutting down mid-capture — snapshot left for resume", { snapshotId: snapshot.id });
      return;
    }
    const finalStatus = await snapshotStatus(snapshot.id);
    if (finalStatus === null) {
      logger.info("worker: snapshot deleted mid-run", { snapshotId: snapshot.id });
      return;
    }
    if (finalStatus === "stopped") {
      logger.info("worker: snapshot stopped by user", { snapshotId: snapshot.id });
      return;
    }

    await db.snapshot.updateMany({
      where: { id: snapshot.id },
      data: { status: "done", finishedAt: new Date() },
    });
    logger.info("worker: snapshot complete", { snapshotId: snapshot.id, total });
  } catch (e) {
    const msg = toMessage(e);
    logger.error("worker: snapshot failed", { snapshotId: snapshot.id, error: msg });
    await db.snapshot
      .update({ where: { id: snapshot.id }, data: { status: "failed", error: msg.slice(0, 500), finishedAt: new Date() } })
      .catch(() => undefined);
  }
}

async function shutdown(): Promise<void> {
  try {
    if (browser) await browser.close();
  } catch (e) {
    logger.warn("worker: error closing browser", { error: toMessage(e) });
  }
  await db.$disconnect().catch(() => undefined);
  logger.info("worker: stopped");
}

async function main(): Promise<void> {
  await enableWal();
  await resumeStuckSnapshots();
  browser = await chromium.launch({ args: ["--disable-blink-features=AutomationControlled"] });
  logger.info("worker: started", { pollMs: POLL_INTERVAL_MS, concurrency: CAPTURE_CONCURRENCY });

  const onSignal = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("worker: shutdown signal — finishing in-flight work", { signal });
  };
  process.on("SIGINT", () => onSignal("SIGINT"));
  process.on("SIGTERM", () => onSignal("SIGTERM"));

  let idleLogged = false;
  while (!shuttingDown) {
    const snapshot = await claimNextSnapshot();
    if (!snapshot) {
      if (!idleLogged) {
        logger.info("worker: no queued snapshots — idling");
        idleLogged = true;
      }
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    idleLogged = false;
    await runSnapshot(snapshot, browser);
  }

  await shutdown();
  process.exit(0);
}

// Start the polling loop only when run as the worker entrypoint. Scripts/tests that import
// runSnapshot set WORKER_NO_MAIN=1 to avoid spawning the loop. (NODE_ENV-style control flag.)
if (process.env.WORKER_NO_MAIN !== "1") {
  main().catch((e) => {
    logger.error("worker: fatal", { error: toMessage(e) });
    process.exit(1);
  });
}
