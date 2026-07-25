import { z } from 'zod';

// Plain-language content vulgarized by the backend from a connected board's
// current task (see specs/007-current-task-vulgarization). No `url` — the
// client is never sent to GitHub to read the task (specs/006-current-task-fetch
// feedback: "un client n'aura jamais... a aller sur github").
export const CurrentTaskItemSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  updatedAt: z.string(),
});
export type CurrentTaskItem = z.infer<typeof CurrentTaskItemSchema>;
