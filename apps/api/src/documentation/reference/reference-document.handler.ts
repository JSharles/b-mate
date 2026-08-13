import { Injectable, OnModuleInit } from '@nestjs/common';
import type { GenerationOperation, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { GenerationProviderResult } from '../../generation/adapters/generation-provider';
import type {
  GenerationHandler,
  GenerationRequestInput,
} from '../../generation/generation-handler.registry';
import { GenerationHandlerRegistry } from '../../generation/generation-handler.registry';
import { PrismaService } from '../../prisma/prisma.service';
import { buildReferenceDocumentPrompt } from './prompts/reference-document.prompt';
import type { ReferenceStatement } from './prompts/reference-document.prompt';
import { itemRef } from '../source/reference-token';
import {
  REFERENCE_DOCUMENT_JSON_SCHEMA,
  REFERENCE_DOCUMENT_OUTPUT_CONTRACT,
  ReferenceDocumentOutputSchema,
  resolveReferenceCitations,
} from './reference-output.schema';

export interface ReferenceInput {
  locale: string;
  sourceRevisionId: string;
  statements: ReferenceStatement[];
}

// One definition of the input, used both when the work is queued and when its
// request is built. Two hand-kept copies is how a stage starts refusing its own
// work for drift it invented itself.
export function referenceFingerprint(input: ReferenceInput): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

export function selectReferenceStatements(
  items: readonly {
    informationItemId: string;
    kind: ReferenceStatement['kind'];
    state: ReferenceStatement['state'];
    content: string;
  }[],
): ReferenceStatement[] {
  return items.map((item, index) => ({
    ref: itemRef(index),
    kind: item.kind,
    state: item.state,
    content: item.content,
  }));
}

// The map from what the model answers with back to what it stands for. Built
// from the same ordered read the fingerprint was taken over, so a ref means the
// same statement on both sides.
export function referenceRefMap(
  items: readonly { informationItemId: string }[],
): Map<string, string> {
  return new Map(
    items.map((item, index) => [itemRef(index), item.informationItemId]),
  );
}

@Injectable()
export class ReferenceDocumentHandler
  implements GenerationHandler, OnModuleInit
{
  readonly type = 'reference_document' as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: GenerationHandlerRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async buildRequest(
    operation: GenerationOperation,
  ): Promise<GenerationRequestInput> {
    const document = await this.prisma.referenceDocument.findUnique({
      where: { generationOperationId: operation.id },
      // Ordered, and ordered the same way the service ordered them when it
      // queued the work. An unordered read here made the fingerprint differ
      // from the one recorded, and the stage refused its own input as drift.
      include: {
        sourceRevision: {
          include: { items: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
    if (!document || document.status !== 'writing') {
      throw new Error('REFERENCE_DOCUMENT_NOT_CURRENT');
    }

    const input: ReferenceInput = {
      locale: document.locale,
      sourceRevisionId: document.sourceRevisionId,
      statements: selectReferenceStatements(document.sourceRevision.items),
    };
    if (referenceFingerprint(input) !== operation.inputFingerprint) {
      throw new Error('REFERENCE_DOCUMENT_INPUT_DRIFT');
    }

    return {
      parts: [{ kind: 'text', text: buildReferenceDocumentPrompt(input) }],
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
      include: {
        sourceRevision: {
          include: { items: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
    if (!document || document.status !== 'writing') {
      throw new Error('REFERENCE_DOCUMENT_NOT_CURRENT');
    }

    const parts = resolveReferenceCitations(
      output,
      referenceRefMap(document.sourceRevision.items),
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
        structuredContent: parts as unknown as Prisma.InputJsonValue,
        failureCode: null,
        version: { increment: 1 },
      },
    });

    // Written against the current head, so nothing is owed until the source
    // moves again (FR-006).
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
}
