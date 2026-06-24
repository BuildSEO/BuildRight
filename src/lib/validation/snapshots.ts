import { z } from "zod";

export const createSnapshotInput = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  discovery: z.enum(["single", "sitemap", "crawl"]).default("sitemap"),
  viewport: z.enum(["desktop", "mobile"]).default("desktop"),
  maxPages: z.number().int().min(1).max(1000).default(200),
});
export type CreateSnapshotInput = z.infer<typeof createSnapshotInput>;
