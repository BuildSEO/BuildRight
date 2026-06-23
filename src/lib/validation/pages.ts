import { z } from "zod";

export const pagesQuery = z.object({
  search: z.string().trim().min(1).optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(1).max(200).default(100),
});
export type PagesQuery = z.infer<typeof pagesQuery>;
