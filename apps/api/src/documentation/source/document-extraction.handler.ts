import { Injectable, OnModuleInit } from '@nestjs/common';
import type { GenerationOperation, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import type {
  GenerationHandler,
  GenerationRequestInput,
} from '../../generation/generation-handler.registry';
import { GenerationHandlerRegistry } from '../../generation/generation-handler.registry';
import type { GenerationProviderResult } from '../../generation/adapters/generation-provider';
import { GenerationPolicyService } from '../../generation/policy/generation-policy.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DocumentInputNormalizerService,
  UploadDocumentInput,
} from './document-input-normalizer.service';
import { DocumentStorageClient } from './document-storage.client';
import {
  DOCUMENT_EXTRACTION_JSON_SCHEMA,
  ExtractionOutputSchema,
} from './extraction-output.schema';
import {
  buildDocumentExtractionPrompt,
  DOCUMENT_EXTRACTION_OUTPUT_CONTRACT,
} from './prompts/extraction.prompt';
import {
  SOURCE_CONSOLIDATION_OUTPUT_CONTRACT,
  SOURCE_CONSOLIDATION_PROMPT_VERSION,
} from './prompts/consolidation.prompt';

// Extraction reads a whole document and emits every observation it holds, so
// its answer grows with the source. This stage ran on the provider default of
// 16k and a Notion page hit the ceiling twice over: the budget has to cover
// the model's reasoning as well as the answer, and both grow with the source.
// A ceiling is only charged when it is used, so it is set well clear of what
// a large document needs rather than at the edge.
const EXTRACTION_MAX_OUTPUT_TOKENS = 64_000;

// Left to decide for itself the model spent 21k tokens reasoning about how to
// transcribe a page — two thirds of the budget, and then it ran out mid-answer.
// Extraction is the mechanical stage: read the document, write down what it
// says. The judgement calls happen later, at consolidation.
const EXTRACTION_EFFORT = 'low' as const;

@Injectable()
export class DocumentExtractionHandler
  implements GenerationHandler, OnModuleInit
{
  readonly type = 'document_extraction' as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DocumentStorageClient,
    private readonly normalizer: DocumentInputNormalizerService,
    private readonly policy: GenerationPolicyService,
    private readonly registry: GenerationHandlerRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async buildRequest(
    operation: GenerationOperation,
  ): Promise<GenerationRequestInput> {
    if (!operation.sourceDocumentId) {
      throw new Error('Document extraction requires a source document.');
    }
    const document = await this.prisma.sourceDocument.findFirst({
      where: { id: operation.sourceDocumentId, projectId: operation.projectId },
    });
    if (
      !document ||
      !document.storedObjectKey ||
      !document.originalMimeType ||
      !document.contentSha256
    ) {
      throw new Error('Source document is unavailable for extraction.');
    }
    const claimed = await this.prisma.sourceDocument.updateMany({
      where: {
        id: document.id,
        projectId: operation.projectId,
        version: document.version,
        status: { in: ['received', 'retrying', 'extracting', 'failed'] },
      },
      data: { status: 'extracting', failureCode: null },
    });
    if (claimed.count !== 1) {
      throw new Error('Source document extraction is no longer current.');
    }

    const bytes = await this.storage.get(document.storedObjectKey);
    const normalized =
      document.kind === 'notion'
        ? this.normalizeStoredNotion(bytes)
        : await this.normalizer.normalizeUpload({
            bytes,
            fileName: document.originalFileName ?? document.title,
            mimeType:
              document.originalMimeType as UploadDocumentInput['mimeType'],
          });

    return {
      parts: [
        {
          kind: 'text',
          text: buildDocumentExtractionPrompt({
            inputFingerprint: operation.inputFingerprint,
            inputChunkCount: normalized.chunks.length,
          }),
        },
        ...normalized.parts,
      ],
      outputContract: DOCUMENT_EXTRACTION_OUTPUT_CONTRACT,
      outputSchema: DOCUMENT_EXTRACTION_JSON_SCHEMA,
      maxOutputTokens: EXTRACTION_MAX_OUTPUT_TOKENS,
      effort: EXTRACTION_EFFORT,
    };
  }

  async apply(
    tx: Prisma.TransactionClient,
    operation: GenerationOperation,
    result: GenerationProviderResult,
  ): Promise<void> {
    const output = ExtractionOutputSchema.parse(result.output);
    if (output.inputFingerprint !== operation.inputFingerprint) {
      throw new Error('Extraction output fingerprint does not match input.');
    }
    if (!operation.sourceDocumentId) {
      throw new Error('Document extraction requires a source document.');
    }

    const claimed = await tx.sourceDocument.updateMany({
      where: {
        id: operation.sourceDocumentId,
        projectId: operation.projectId,
        status: { in: ['extracting', 'retrying'] },
      },
      data: { status: 'ready_to_consolidate', failureCode: null },
    });
    if (claimed.count !== 1) {
      return;
    }

    for (const observation of output.observations) {
      await tx.documentObservation.create({
        data: {
          sourceDocumentId: operation.sourceDocumentId,
          sequence: observation.sequence,
          kind: observation.kind,
          originalExcerpt: observation.originalExcerpt,
          normalizedContent: observation.normalizedContent,
          sourceLanguage: observation.normalizedLanguage,
          locator: observation.locator,
          exactContentHash: createHash('sha256')
            .update(observation.normalizedContent)
            .digest('hex'),
          categories: {
            create: observation.categories.map((categoryKey) => ({
              categoryKey,
            })),
          },
        },
      });
    }

    const source = await tx.projectSource.upsert({
      where: { projectId: operation.projectId },
      update: {},
      create: { projectId: operation.projectId },
    });
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          documentId: operation.sourceDocumentId,
          documentFingerprint: operation.inputFingerprint,
          baseRevisionId: source.currentRevisionId,
          observations: output.observations.map((item) => ({
            sequence: item.sequence,
            content: item.normalizedContent,
          })),
        }),
      )
      .digest('hex');
    const policySnapshot = this.policy.snapshotFor('source_consolidation');
    await tx.generationOperation.upsert({
      where: {
        deduplicationKey: `source-consolidation:${operation.sourceDocumentId}:${source.currentRevisionId ?? 'empty'}`,
      },
      update: {},
      create: {
        projectId: operation.projectId,
        type: 'source_consolidation',
        deduplicationKey: `source-consolidation:${operation.sourceDocumentId}:${source.currentRevisionId ?? 'empty'}`,
        inputFingerprint: fingerprint,
        sourceDocumentId: operation.sourceDocumentId,
        baseSourceRevisionId: source.currentRevisionId,
        promptVersion: SOURCE_CONSOLIDATION_PROMPT_VERSION,
        outputContractVersion: SOURCE_CONSOLIDATION_OUTPUT_CONTRACT,
        policySnapshot: policySnapshot as unknown as Prisma.InputJsonValue,
        status: 'queued',
      },
    });
  }

  async onTerminalFailure(
    tx: Prisma.TransactionClient,
    operation: GenerationOperation,
    failureCode: string,
  ): Promise<void> {
    if (!operation.sourceDocumentId) return;
    await tx.sourceDocument.updateMany({
      where: {
        id: operation.sourceDocumentId,
        projectId: operation.projectId,
        status: { in: ['received', 'extracting', 'retrying'] },
      },
      data: { status: 'failed', failureCode },
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
