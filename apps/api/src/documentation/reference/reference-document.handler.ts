import { Injectable, OnModuleInit } from '@nestjs/common';
import type { GenerationOperation, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import type {
  GenerationProviderResult,
  GenerationRequestPart,
} from '../../generation/adapters/generation-provider';
import type {
  GenerationHandler,
  GenerationRequestInput,
} from '../../generation/generation-handler.registry';
import { GenerationHandlerRegistry } from '../../generation/generation-handler.registry';
import { PrismaService } from '../../prisma/prisma.service';
import { DocumentStorageClient } from '../source/document-storage.client';
import {
  DocumentInputNormalizerService,
  type UploadDocumentInput,
} from '../source/document-input-normalizer.service';
import { buildReferenceDocumentPrompt } from './prompts/reference-document.prompt';
import {
  REFERENCE_DOCUMENT_JSON_SCHEMA,
  REFERENCE_DOCUMENT_OUTPUT_CONTRACT,
  ReferenceDocumentOutputSchema,
  resolveReference,
} from './reference-output.schema';

export interface ReferenceInputShape {
  locale: string;
  documentIds: string[];
  noteIds: string[];
}

// One definition of what the input is, used both when the work is queued and
// when its request is built. Two hand-kept copies is how a stage starts
// refusing its own work for drift it invented itself.
export function referenceFingerprint(input: ReferenceInputShape): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

export function documentRef(index: number): string {
  return `d${index}`;
}

@Injectable()
export class ReferenceDocumentHandler
  implements GenerationHandler, OnModuleInit
{
  readonly type = 'reference_document' as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: GenerationHandlerRegistry,
    private readonly storage: DocumentStorageClient,
    private readonly normalizer: DocumentInputNormalizerService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  // Ordered the same way everywhere, so a ref means the same document on both
  // sides of the fingerprint.
  private loadDocuments(projectId: string) {
    return this.prisma.sourceDocument.findMany({
      where: { projectId, status: 'incorporated' },
      orderBy: { createdAt: 'asc' },
    });
  }

  private loadNotes(projectId: string) {
    return this.prisma.note.findMany({
      where: { projectId, archivedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  async buildRequest(
    operation: GenerationOperation,
  ): Promise<GenerationRequestInput> {
    const document = await this.prisma.referenceDocument.findUnique({
      where: { generationOperationId: operation.id },
    });
    if (!document || document.status !== 'writing') {
      throw new Error('REFERENCE_DOCUMENT_NOT_CURRENT');
    }

    const [documents, notes] = await Promise.all([
      this.loadDocuments(document.projectId),
      this.loadNotes(document.projectId),
    ]);

    const shape: ReferenceInputShape = {
      locale: document.locale,
      documentIds: documents.map((entry) => entry.id),
      noteIds: notes.map((note) => note.id),
    };
    if (referenceFingerprint(shape) !== operation.inputFingerprint) {
      throw new Error('REFERENCE_DOCUMENT_INPUT_DRIFT');
    }

    // The documents themselves, read as the model can take them — the same
    // normalisation the old extraction stage used, kept because turning a PDF
    // or a Notion page into something readable is real work independent of
    // what we then ask for.
    const parts: GenerationRequestPart[] = [
      {
        kind: 'text',
        text: buildReferenceDocumentPrompt({
          locale: document.locale,
          documents: documents.map((entry, index) => ({
            ref: documentRef(index),
            title: entry.title,
          })),
          notes: notes.map((note) => ({
            content: note.content,
            context: note.context,
          })),
        }),
      },
    ];

    for (const [index, entry] of documents.entries()) {
      if (!entry.storedObjectKey) continue;
      const bytes = await this.storage.get(entry.storedObjectKey);
      const normalized =
        entry.kind === 'notion'
          ? this.normalizeStoredNotion(bytes)
          : await this.normalizer.normalizeUpload({
              bytes,
              fileName: entry.originalFileName ?? entry.title,
              mimeType:
                entry.originalMimeType as UploadDocumentInput['mimeType'],
            });
      parts.push({
        kind: 'text',
        text: `--- ${documentRef(index)}: ${entry.title} ---`,
      });
      parts.push(...normalized.parts);
    }

    return {
      parts,
      outputContract: REFERENCE_DOCUMENT_OUTPUT_CONTRACT,
      outputSchema: REFERENCE_DOCUMENT_JSON_SCHEMA,
      maxOutputTokens: 32_000,
    };
  }

  async apply(
    tx: Prisma.TransactionClient,
    operation: GenerationOperation,
    result: GenerationProviderResult,
  ): Promise<void> {
    const output = ReferenceDocumentOutputSchema.parse(result.output);
    const document = await tx.referenceDocument.findUnique({
      where: { generationOperationId: operation.id },
    });
    if (!document || document.status !== 'writing') {
      throw new Error('REFERENCE_DOCUMENT_NOT_CURRENT');
    }

    const documents = await tx.sourceDocument.findMany({
      where: { projectId: document.projectId, status: 'incorporated' },
      orderBy: { createdAt: 'asc' },
      select: { title: true },
    });
    const resolved = resolveReference(
      output,
      new Map(
        documents.map((entry, index) => [documentRef(index), entry.title]),
      ),
    );

    // The one before it stops being current the moment this one is ready. Two
    // documents both reading as current is the same defect as two published
    // releases, one level up.
    await tx.referenceDocument.updateMany({
      where: {
        projectId: document.projectId,
        status: 'ready',
        id: { not: document.id },
      },
      data: { status: 'superseded' },
    });

    await tx.referenceDocument.update({
      where: { id: document.id },
      data: {
        status: 'ready',
        outcome: output.outcome,
        structuredContent: resolved.parts as unknown as Prisma.InputJsonValue,
        points: resolved.points as unknown as Prisma.InputJsonValue,
        unrelatedDocuments:
          resolved.unrelatedDocumentTitles as unknown as Prisma.InputJsonValue,
        failureCode: null,
        version: { increment: 1 },
      },
    });

    await tx.projectSource.updateMany({
      where: { projectId: document.projectId },
      data: { activeReferenceDocumentId: null, referenceNeedsRewrite: false },
    });
  }

  // A project holds one writing slot. Nothing else releases it, so a generation
  // that dies has to hand it back — otherwise the project sits on "writing"
  // forever and every later rewrite finds the slot taken.
  async onTerminalFailure(
    tx: Prisma.TransactionClient,
    operation: GenerationOperation,
    failureCode: string,
  ): Promise<void> {
    const document = await tx.referenceDocument.findFirst({
      where: { generationOperationId: operation.id, status: 'writing' },
      select: { id: true, projectId: true },
    });
    if (!document) return;
    await tx.referenceDocument.update({
      where: { id: document.id },
      data: { status: 'failed', failureCode, version: { increment: 1 } },
    });
    // The previous document stays readable and the project stays owed a
    // rewrite, so a failure costs a retry rather than the reference itself.
    await tx.projectSource.updateMany({
      where: {
        projectId: document.projectId,
        activeReferenceDocumentId: document.id,
      },
      data: { activeReferenceDocumentId: null, referenceNeedsRewrite: true },
    });
  }

  private normalizeStoredNotion(bytes: Buffer) {
    const snapshot = JSON.parse(bytes.toString('utf8')) as {
      pageId: string;
      title: string;
      content: string;
    };
    return this.normalizer.normalizeNotion({
      pageId: snapshot.pageId,
      title: snapshot.title,
      blocks: [{ id: snapshot.pageId, position: 0, text: snapshot.content }],
    });
  }
}
