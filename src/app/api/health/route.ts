import { db } from "@/lib/db";
import { handle, ok } from "@/lib/api/handle";
import { settings, WORKER_HEARTBEAT_ID } from "@/lib/settings";

export const runtime = "nodejs";

// Liveness: is the app up, and has the worker beaten recently?
export const GET = handle(async () => {
  const hb = await db.workerHeartbeat.findUnique({ where: { id: WORKER_HEARTBEAT_ID } });
  const lastBeatAt = hb?.lastBeatAt ?? null;
  const workerAlive = lastBeatAt
    ? Date.now() - lastBeatAt.getTime() < settings.worker.heartbeatStaleMs
    : false;
  return ok({ ok: true, workerAlive, lastBeatAt }, { headers: { "cache-control": "no-store" } });
});
