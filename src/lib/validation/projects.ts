import { z } from "zod";

export const createProjectInput = z.object({
  name: z.string().trim().min(1).max(120),
  domain: z.string().trim().min(1).max(255),
});
export type CreateProjectInput = z.infer<typeof createProjectInput>;

export const listProjectsQuery = z.object({
  q: z.string().trim().min(1).optional(),
});
