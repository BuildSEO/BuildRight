/**
 * Typed client-side fetch helpers for the UI. Unwraps the { ok, data } / { ok, error } envelope
 * and throws on error so TanStack Query surfaces it. (Client-safe: no server-only imports.)
 */

import type { CreateProjectInput } from "@/lib/validation/projects";
import type { CreateSnapshotInput } from "@/lib/validation/snapshots";

type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string; details?: unknown } };

async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const json = (await res.json()) as Envelope<T>;
  if (!json.ok) throw new Error(json.error.message || "Request failed");
  return json.data;
}

function jsonBody(body: unknown): RequestInit {
  return { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

export interface ProjectSummary {
  id: string;
  name: string;
  domain: string;
  createdAt: string;
  snapshotCount: number;
  lastSnapshotAt: string | null;
}

export interface SnapshotSummary {
  id: string;
  label: string | null;
  status: Snapshot["status"];
  discovery: Snapshot["discovery"];
  maxPages: number;
  totalPages: number;
  donePages: number;
  createdAt: string;
  finishedAt: string | null;
}

export interface ProjectDetail {
  id: string;
  name: string;
  domain: string;
  createdAt: string;
  snapshots: SnapshotSummary[];
}

export interface Snapshot {
  id: string;
  projectId: string;
  label: string | null;
  status: "queued" | "discovering" | "capturing" | "done" | "failed";
  discovery: "sitemap" | "crawl";
  maxPages: number;
  totalPages: number;
  donePages: number;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  project?: { id: string; name: string; domain: string };
}

export interface PageRow {
  id: string;
  url: string;
  status: "queued" | "capturing" | "done" | "failed";
  httpStatus: number | null;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  wordCount: number | null;
  width: number | null;
  height: number | null;
  fileSizeBytes: number | null;
  screenshotPath: string | null;
  pdfPath: string | null;
  error: string | null;
  capturedAt: string | null;
}

export interface PageDetail extends PageRow {
  snapshotId: string;
  canonical: string | null;
  metaRobots: string | null;
  headings: Record<string, string[]> | null;
  schema: unknown[] | null;
  links: { href: string; anchor: string; internal: boolean }[] | null;
  htmlGzPath: string | null;
}

export const api = {
  listProjects: (q?: string): Promise<ProjectSummary[]> =>
    apiFetch(`/api/projects${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  createProject: (body: CreateProjectInput): Promise<ProjectSummary> =>
    apiFetch("/api/projects", jsonBody(body)),
  getProject: (id: string): Promise<ProjectDetail> => apiFetch(`/api/projects/${id}`),
  createSnapshot: (projectId: string, body: Partial<CreateSnapshotInput>): Promise<Snapshot> =>
    apiFetch(`/api/projects/${projectId}/snapshots`, jsonBody(body)),
  getSnapshot: (id: string): Promise<Snapshot> => apiFetch(`/api/snapshots/${id}`),
  listPages: (
    snapshotId: string,
    opts: { search?: string; cursor?: string; take?: number } = {},
  ): Promise<{ pages: PageRow[]; nextCursor: string | null }> => {
    const qs = new URLSearchParams();
    if (opts.search) qs.set("search", opts.search);
    if (opts.cursor) qs.set("cursor", opts.cursor);
    if (opts.take) qs.set("take", String(opts.take));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return apiFetch(`/api/snapshots/${snapshotId}/pages${suffix}`);
  },
  getPage: (id: string): Promise<PageDetail> => apiFetch(`/api/pages/${id}`),
  screenshotUrl: (id: string): string => `/api/pages/${id}/screenshot`,
  pdfUrl: (id: string): string => `/api/pages/${id}/pdf`,
};
