import { CreateProjectRequestSchema } from "schemas";
import type { z } from "zod";

export const CreateProjectFormSchema = CreateProjectRequestSchema;
export type CreateProjectFormValues = z.infer<typeof CreateProjectFormSchema>;
