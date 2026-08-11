import { describe, expect, it } from 'vitest';
import {
  CanonicalSourcePageSchema,
  DocumentAcknowledgementSchema,
  ItemProvenanceSchema,
  SourceDocumentDetailSchema,
  SourceDocumentSchema,
  SourceLocatorSchema,
  SourceRevisionChangeSchema,
  SourceRevisionSummarySchema,
} from './documentation-source';

const UUID = '00000000-0000-4000-8000-000000000001';
const UUID_2 = '00000000-0000-4000-8000-000000000002';

describe('documentation source contracts', () => {
  it('validates document lifecycle, detail, and durable acknowledgement', () => {
    const document = SourceDocumentSchema.parse({
      id: UUID,
      kind: 'upload',
      status: 'extracting',
      version: 1,
      title: 'Cadrage',
      failureCode: null,
      incorporatedInRevisionId: null,
      createdAt: '2026-08-11T12:00:00.000Z',
    });
    expect(
      SourceDocumentDetailSchema.parse({
        ...document,
        originalFileName: 'cadrage.pdf',
        originalMimeType: 'application/pdf',
        originalSizeBytes: 1024,
        originalDownloadUrl: 'https://example.test/original',
        externalUrl: null,
        affectedCategories: ['overview'],
      }),
    ).toBeDefined();
    expect(
      DocumentAcknowledgementSchema.parse({
        document,
        operation: { operationId: UUID_2, status: 'queued' },
      }),
    ).toBeDefined();
  });

  it.each([
    { type: 'pdf_page', page: 2, excerpt: 'Date de lancement' },
    { type: 'docx_heading', heading: 'Planning', paragraph: 1 },
    { type: 'image_region', x: 80, y: 120, width: 880, height: 160 },
    { type: 'notion_block', blockId: 'block-1', position: 2 },
  ])('validates attributable locator $type', (locator) => {
    expect(SourceLocatorSchema.parse(locator)).toEqual(locator);
  });

  it('rejects malformed locator coordinates and unknown locator variants', () => {
    expect(
      SourceLocatorSchema.safeParse({
        type: 'pdf_page',
        page: 0,
        excerpt: 'invalid',
      }).success,
    ).toBe(false);
    expect(
      SourceLocatorSchema.safeParse({ type: 'url', href: 'https://x.test' })
        .success,
    ).toBe(false);
  });

  it('validates revision headers, changes, canonical items, and cursor pages', () => {
    const revision = SourceRevisionSummarySchema.parse({
      id: UUID,
      sequence: 2,
      trigger: 'document_added',
      summary: 'Document incorporated: Cadrage',
      // The server keeps an English summary for support; the interface writes
      // the sentence a contributor reads from the trigger and this title.
      triggerDocumentTitle: 'Cadrage',
      impactedCategories: ['overview'],
      createdAt: '2026-08-11T12:00:00.000Z',
    });
    expect(
      SourceRevisionChangeSchema.parse({
        informationItemId: UUID_2,
        kind: 'updated',
        beforeRevisionItemId: UUID,
        afterRevisionItemId: UUID_2,
        explanation: 'La date explicite remplace la précédente.',
      }),
    ).toBeDefined();
    expect(
      CanonicalSourcePageSchema.parse({
        revision,
        items: [
          {
            id: UUID_2,
            kind: 'date',
            state: 'confirmed',
            content: 'Le lancement est prévu le 15 octobre.',
            categories: ['planning'],
            provenanceCount: 1,
            clarificationIds: [],
          },
        ],
        total: 1,
        nextCursor: null,
      }),
    ).toBeDefined();
  });

  it('validates provenance history without leaking storage keys', () => {
    expect(
      ItemProvenanceSchema.parse({
        itemId: UUID,
        revisionId: UUID_2,
        origins: [
          {
            kind: 'document',
            documentId: UUID,
            label: 'Cadrage',
            locator: { type: 'pdf_page', page: 1, excerpt: 'Budget' },
            excerpt: 'Budget validé',
            role: 'supports',
          },
        ],
        history: [
          {
            revisionId: UUID_2,
            revisionSequence: 2,
            change: 'updated',
            createdAt: '2026-08-11T12:00:00.000Z',
          },
        ],
      }),
    ).toBeDefined();
    expect(
      ItemProvenanceSchema.safeParse({
        itemId: UUID,
        revisionId: UUID_2,
        origins: [
          {
            kind: 'document',
            documentId: UUID,
            label: 'Cadrage',
            locator: null,
            excerpt: null,
            role: 'supports',
            storedObjectKey: 'secret/path.pdf',
          },
        ],
        history: [],
      }).success,
    ).toBe(false);
  });

});
