import { z } from 'zod';
import { RESOURCE_CATEGORY_KEYS } from './resource-categories';

// Internal to this module — never crosses the API boundary. Narrows the
// analysis provider's structured tool-use response before any of it is
// persisted as ResourceSection rows.
//
// The provider's own tool schema already constrains this shape; validating
// again here is deliberate defence in depth at a third-party boundary
// (Constitution II), and it is what turns a truncated or malformed response
// into a clean "this resource failed" rather than a crash mid-transaction.
//
// specs/014-category-sections research.md Decision 1: both locales arrive in
// the same object, from a single request. That is what structurally
// guarantees the two languages agree on which categories a document was split
// into (FR-011), instead of it being something to reconcile afterwards.
export const DocumentSectionSchema = z.object({
  categoryKey: z.enum(RESOURCE_CATEGORY_KEYS),
  titleEn: z.string().min(1),
  contentEn: z.string().min(1),
  titleFr: z.string().min(1),
  contentFr: z.string().min(1),
});
export type DocumentSection = z.infer<typeof DocumentSectionSchema>;

export const DocumentSectionsOutputSchema = z.object({
  sections: z.array(DocumentSectionSchema),
});
export type DocumentSectionsOutput = z.infer<
  typeof DocumentSectionsOutputSchema
>;
