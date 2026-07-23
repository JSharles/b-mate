import { z } from 'zod';

// Real GitHub content, shown as-is to clients — no AI rewording (see
// specs/006-current-task-fetch). `url` is null for a draft issue, which has
// no permalink of its own.
export const CurrentTaskItemSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  url: z.url().nullable(),
});
export type CurrentTaskItem = z.infer<typeof CurrentTaskItemSchema>;
