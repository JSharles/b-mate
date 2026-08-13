import { z } from "zod";

export const DocumentationUuidSchema = z.uuid();
export const DocumentationProjectLanguageSchema = z.enum(["en", "fr"]);

export const CursorSchema = z.string().trim().min(1).max(2048);

export function createCursorPageSchema<T extends z.ZodType>(itemSchema: T) {
  return z
    .object({
      items: z.array(itemSchema),
      total: z.number().int().nonnegative(),
      nextCursor: CursorSchema.nullable(),
    })
    .strict();
}

export const ExpectedVersionSchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();

export const SafeErrorSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[A-Z0-9_]+$/),
    parameters: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

// A section's factual layer, shaped like the reference document it is a view
// of: prose, and what the document leaves open kept as its own kind rather than
// smoothed into a sentence that reads as settled.
export const StructuredBlockKindSchema = z.enum(["paragraph", "open_point"]);

export const StructuredContentBlockSchema = z
  .object({
    kind: StructuredBlockKindSchema,
    text: z.string().trim().min(1),
  })
  .strict();

export const StructuredContentSchema = z
  .object({ blocks: z.array(StructuredContentBlockSchema).min(1) })
  .strict();

export const PublicStructuredContentBlockSchema = z
  .object({
    kind: StructuredBlockKindSchema,
    text: z.string().trim().min(1),
  })
  .strict();

export const PublicStructuredContentSchema = z
  .object({ blocks: z.array(PublicStructuredContentBlockSchema).min(1) })
  .strict();

export type Cursor = z.infer<typeof CursorSchema>;
export type ExpectedVersion = z.infer<typeof ExpectedVersionSchema>;
export type SafeError = z.infer<typeof SafeErrorSchema>;
export type StructuredContent = z.infer<typeof StructuredContentSchema>;
export type PublicStructuredContent = z.infer<
  typeof PublicStructuredContentSchema
>;
