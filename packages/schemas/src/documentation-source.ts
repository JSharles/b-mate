import { z } from "zod";
import { AsyncOperationSchema } from "./generation";
import {
  CursorSchema,
  DocumentationUuidSchema,
  createCursorPageSchema,
} from "./documentation-common";

export const SourceDocumentKindSchema = z.enum(["upload", "notion"]);
export const SourceDocumentStatusSchema = z.enum([
  "received",
  "extracting",
  "ready_to_consolidate",
  "incorporating",
  "incorporated",
  "retrying",
  "failed",
  "removal_pending",
  "removal_failed",
  "removed",
]);

export const SourceDocumentSchema = z
  .object({
    id: DocumentationUuidSchema,
    kind: SourceDocumentKindSchema,
    status: SourceDocumentStatusSchema,
    version: z.number().int().positive(),
    title: z.string().trim().min(1),
    failureCode: z.string().trim().min(1).max(128).nullable(),
    incorporatedInRevisionId: DocumentationUuidSchema.nullable(),
    // When the run in progress began, which a restart resets. Distinct from
    // createdAt: after a restart the row was still counting from the day the
    // document was added.
    processingStartedAt: z.iso.datetime(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const SourceDocumentDetailSchema = SourceDocumentSchema.extend({
  originalFileName: z.string().nullable(),
  originalMimeType: z.string().nullable(),
  originalSizeBytes: z.number().int().nonnegative().nullable(),
  originalDownloadUrl: z.url().nullable(),
  externalUrl: z.url().nullable(),
}).strict();

export const SourceDocumentPageSchema = createCursorPageSchema(
  SourceDocumentSchema,
);

export const DocumentAcknowledgementSchema = z
  .object({
    document: SourceDocumentSchema,
    operation: AsyncOperationSchema,
  })
  .strict();

export const PdfPageLocatorSchema = z
  .object({
    type: z.literal("pdf_page"),
    page: z.number().int().positive(),
    excerpt: z.string().trim().min(1).max(2000),
  })
  .strict();

export const DocxHeadingLocatorSchema = z
  .object({
    type: z.literal("docx_heading"),
    heading: z.string().trim().min(1).max(500),
    paragraph: z.number().int().nonnegative(),
  })
  .strict();

export const ImageRegionLocatorSchema = z
  .object({
    type: z.literal("image_region"),
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    width: z.number().positive(),
    height: z.number().positive(),
  })
  .strict();

export const NotionBlockLocatorSchema = z
  .object({
    type: z.literal("notion_block"),
    blockId: z.string().trim().min(1).max(255),
    position: z.number().int().nonnegative(),
  })
  .strict();

export const SourceLocatorSchema = z.discriminatedUnion("type", [
  PdfPageLocatorSchema,
  DocxHeadingLocatorSchema,
  ImageRegionLocatorSchema,
  NotionBlockLocatorSchema,
]);

export const SourceRevisionTriggerSchema = z.enum([
  "document_added",
  "document_removed",
  "clarification_answered",
  "guided_correction",
  "working_language_changed",
]);

export const SourceRevisionSummarySchema = z
  .object({
    id: DocumentationUuidSchema,
    sequence: z.number().int().positive(),
    trigger: SourceRevisionTriggerSchema,
    // Server-side detail, kept for support and audit. The interface writes the
    // sentence itself from `trigger` and `triggerDocumentTitle`, so a French
    // contributor does not read English.
    summary: z.string().trim().min(1),
    triggerDocumentTitle: z.string().nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const SourceRevisionPageSchema = createCursorPageSchema(
  SourceRevisionSummarySchema,
);

export const RevisionChangeKindSchema = z.enum([
  "added",
  "updated",
  "confirmed",
  "superseded",
  "removed",
  "provenance_added",
  "provenance_removed",
  "translated",
  "marked_open",
  "resolved",
]);

export const SourceRevisionChangeSchema = z
  .object({
    informationItemId: DocumentationUuidSchema,
    kind: RevisionChangeKindSchema,
    beforeRevisionItemId: DocumentationUuidSchema.nullable().optional(),
    afterRevisionItemId: DocumentationUuidSchema.nullable().optional(),
    explanation: z.string().trim().min(1),
  })
  .strict();

export const InformationItemKindSchema = z.enum([
  "fact",
  "decision",
  "date",
  "figure",
  "constraint",
  "explanation",
  "open_point",
]);
export const InformationItemStateSchema = z.enum([
  "confirmed",
  "point_to_clarify",
]);

export const CanonicalItemSchema = z
  .object({
    id: DocumentationUuidSchema,
    kind: InformationItemKindSchema,
    state: InformationItemStateSchema,
    content: z.string().trim().min(1),
    provenanceCount: z.number().int().positive(),
    clarificationIds: z.array(DocumentationUuidSchema).default([]),
  })
  .strict();

export const CanonicalSourcePageSchema = z
  .object({
    revision: SourceRevisionSummarySchema,
    items: z.array(CanonicalItemSchema),
    total: z.number().int().nonnegative(),
    nextCursor: CursorSchema.nullable(),
  })
  .strict();

export const ProvenanceRoleSchema = z.enum([
  "supports",
  "conflicts",
  "supersedes",
  "confirms",
]);

export const ProvenanceOriginSchema = z
  .object({
    kind: z.enum(["document", "contributor"]),
    documentId: DocumentationUuidSchema.nullable().optional(),
    label: z.string().trim().min(1),
    locator: SourceLocatorSchema.nullable(),
    excerpt: z.string().nullable(),
    role: ProvenanceRoleSchema,
  })
  .strict();

export const ItemProvenanceSchema = z
  .object({
    itemId: DocumentationUuidSchema,
    revisionId: DocumentationUuidSchema,
    origins: z.array(ProvenanceOriginSchema).min(1),
    history: z.array(
      z
        .object({
          revisionId: DocumentationUuidSchema,
          revisionSequence: z.number().int().positive(),
          change: RevisionChangeKindSchema,
          createdAt: z.iso.datetime(),
        })
        .strict(),
    ),
  })
  .strict();

export const CreateNotionSourceDocumentRequestSchema = z
  .object({ pageUrl: z.url().max(2048) })
  .strict();

export const GuidedCorrectionRequestSchema = z
  .object({
    expectedSourceRevisionId: DocumentationUuidSchema,
    correctedContent: z.string().trim().min(1).max(10_000),
    reason: z.string().trim().max(2000).optional(),
  })
  .strict();

export type SourceDocument = z.infer<typeof SourceDocumentSchema>;
export type SourceDocumentDetail = z.infer<
  typeof SourceDocumentDetailSchema
>;
export type DocumentAcknowledgement = z.infer<
  typeof DocumentAcknowledgementSchema
>;
export type SourceLocator = z.infer<typeof SourceLocatorSchema>;
export type SourceRevisionSummary = z.infer<
  typeof SourceRevisionSummarySchema
>;
export type CanonicalItem = z.infer<typeof CanonicalItemSchema>;
export type CanonicalSourcePage = z.infer<typeof CanonicalSourcePageSchema>;
export type ItemProvenance = z.infer<typeof ItemProvenanceSchema>;
export type GuidedCorrectionRequest = z.infer<
  typeof GuidedCorrectionRequestSchema
>;
