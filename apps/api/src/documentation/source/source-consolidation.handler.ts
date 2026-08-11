import { Injectable, OnModuleInit } from '@nestjs/common';
import type { GenerationOperation, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type {
  GenerationHandler,
  GenerationRequestInput,
} from '../../generation/generation-handler.registry';
import { GenerationHandlerRegistry } from '../../generation/generation-handler.registry';
import type { GenerationProviderResult } from '../../generation/adapters/generation-provider';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CLARIFICATION_JSON_SCHEMA,
  ClarificationCandidate,
  ClarificationCandidateSchema,
} from './clarification-output.schema';
import {
  ConsolidationDisposition,
  SourceRevisionService,
} from './source-revision.service';
import {
  buildSourceConsolidationPrompt,
  SOURCE_CONSOLIDATION_OUTPUT_CONTRACT,
  SOURCE_CONSOLIDATION_PROMPT_VERSION,
} from './prompts/consolidation.prompt';
import {
  buildSourceLanguageChangePrompt,
  SOURCE_LANGUAGE_CHANGE_OUTPUT_CONTRACT,
  SOURCE_LANGUAGE_CHANGE_PROMPT_VERSION,
} from './prompts/language-change.prompt';

const SourceLanguageChangeOutputSchema = z
  .object({
    promptVersion: z.literal(SOURCE_LANGUAGE_CHANGE_PROMPT_VERSION),
    inputFingerprint: z.string().regex(/^[0-9a-f]{64}$/u),
    items: z.array(
      z
        .object({
          informationItemId: z.uuid(),
          translatedContent: z.string().trim().min(1).max(20_000),
        })
        .strict(),
    ),
    accounting: z
      .object({ translatedItemCount: z.number().int().nonnegative() })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.accounting.translatedItemCount !== value.items.length) {
      context.addIssue({
        code: 'custom',
        path: ['accounting', 'translatedItemCount'],
        message: 'Language output accounting must match translated items.',
      });
    }
  });

const SOURCE_LANGUAGE_CHANGE_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['promptVersion', 'inputFingerprint', 'items', 'accounting'],
  properties: {
    promptVersion: { const: SOURCE_LANGUAGE_CHANGE_PROMPT_VERSION },
    inputFingerprint: { type: 'string', pattern: '^[0-9a-f]{64}$' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['informationItemId', 'translatedContent'],
        properties: {
          informationItemId: { type: 'string', format: 'uuid' },
          translatedContent: { type: 'string', minLength: 1 },
        },
      },
    },
    accounting: {
      type: 'object',
      additionalProperties: false,
      required: ['translatedItemCount'],
      properties: {
        translatedItemCount: { type: 'integer', minimum: 0 },
      },
    },
  },
};

const ConsolidationDispositionSchema = z
  .object({
    observationId: z.uuid(),
    action: z.enum([
      'add',
      'support',
      'supersede',
      'conflict',
      'open',
      'exclude',
    ]),
    targetInformationItemId: z.uuid().optional(),
    match: z.enum(['exact', 'semantic']).optional(),
    reason: z.string().trim().min(1).max(2_000),
  })
  .strict()
  .superRefine((value, context) => {
    const needsTarget = ['support', 'supersede', 'conflict'].includes(
      value.action,
    );
    if (needsTarget && !value.targetInformationItemId) {
      context.addIssue({
        code: 'custom',
        path: ['targetInformationItemId'],
        message: `${value.action} requires a target item.`,
      });
    }
  });

export const SourceConsolidationOutputSchema = z
  .object({
    promptVersion: z.literal(SOURCE_CONSOLIDATION_PROMPT_VERSION),
    inputFingerprint: z.string().regex(/^[0-9a-f]{64}$/u),
    dispositions: z.array(ConsolidationDispositionSchema),
    clarifications: z.array(ClarificationCandidateSchema),
    accounting: z
      .object({
        inputObservationCount: z.number().int().nonnegative(),
        dispositionCount: z.number().int().nonnegative(),
        clarificationCount: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.accounting.dispositionCount !== value.dispositions.length ||
      value.accounting.inputObservationCount !== value.dispositions.length ||
      value.accounting.clarificationCount !== value.clarifications.length
    ) {
      context.addIssue({
        code: 'custom',
        path: ['accounting'],
        message:
          'Output accounting must cover every observation and clarification.',
      });
    }
  });

export const SOURCE_CONSOLIDATION_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'promptVersion',
    'inputFingerprint',
    'dispositions',
    'clarifications',
    'accounting',
  ],
  properties: {
    promptVersion: { const: SOURCE_CONSOLIDATION_PROMPT_VERSION },
    inputFingerprint: { type: 'string', pattern: '^[0-9a-f]{64}$' },
    dispositions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['observationId', 'action', 'reason'],
        properties: {
          observationId: { type: 'string', format: 'uuid' },
          action: {
            enum: [
              'add',
              'support',
              'supersede',
              'conflict',
              'open',
              'exclude',
            ],
          },
          targetInformationItemId: { type: 'string', format: 'uuid' },
          match: { enum: ['exact', 'semantic'] },
          reason: { type: 'string' },
        },
      },
    },
    clarifications: CLARIFICATION_JSON_SCHEMA,
    accounting: {
      type: 'object',
      additionalProperties: false,
      required: [
        'inputObservationCount',
        'dispositionCount',
        'clarificationCount',
      ],
      properties: {
        inputObservationCount: { type: 'integer', minimum: 0 },
        dispositionCount: { type: 'integer', minimum: 0 },
        clarificationCount: { type: 'integer', minimum: 0 },
      },
    },
  },
};

@Injectable()
export class SourceConsolidationHandler
  implements GenerationHandler, OnModuleInit
{
  readonly type = 'source_consolidation' as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly revisions: SourceRevisionService,
    private readonly registry: GenerationHandlerRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async buildRequest(
    operation: GenerationOperation,
  ): Promise<GenerationRequestInput> {
    if (operation.sourceLanguageProposalId) {
      return this.buildLanguageChangeRequest(operation);
    }
    if (!operation.sourceDocumentId) {
      throw new Error('Source consolidation requires a document.');
    }
    const document = await this.prisma.sourceDocument.findFirst({
      where: {
        id: operation.sourceDocumentId,
        projectId: operation.projectId,
        status: { in: ['ready_to_consolidate', 'incorporating'] },
      },
    });
    if (!document) {
      throw new Error('Source consolidation document is no longer current.');
    }
    const claimed = await this.prisma.sourceDocument.updateMany({
      where: {
        id: document.id,
        projectId: operation.projectId,
        version: document.version,
        status: { in: ['ready_to_consolidate', 'incorporating'] },
      },
      data: { status: 'incorporating', failureCode: null },
    });
    if (claimed.count !== 1) {
      throw new Error('Source consolidation document is no longer current.');
    }
    const source = await this.prisma.projectSource.findUnique({
      where: { projectId: operation.projectId },
      include: {
        currentRevision: {
          include: {
            items: {
              include: { categories: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
      },
    });
    const observations = await this.prisma.documentObservation.findMany({
      where: { sourceDocumentId: document.id },
      include: { categories: true },
      orderBy: { sequence: 'asc' },
    });
    return {
      parts: [
        {
          kind: 'text',
          text: buildSourceConsolidationPrompt({
            workingLanguage: source?.workingLanguage ?? 'en',
            inputFingerprint: operation.inputFingerprint,
            observationCount: observations.length,
          }),
        },
        {
          kind: 'json',
          value: {
            currentItems:
              source?.currentRevision?.items.map((item) => ({
                informationItemId: item.informationItemId,
                kind: item.kind,
                state: item.state,
                content: item.content,
                categories: item.categories.map(
                  (category) => category.categoryKey,
                ),
              })) ?? [],
            observations: observations.map((observation) => ({
              id: observation.id,
              kind: observation.kind,
              content: observation.normalizedContent,
              exactContentHash: observation.exactContentHash,
              categories: observation.categories.map(
                (category) => category.categoryKey,
              ),
            })),
          },
        },
      ],
      outputContract: SOURCE_CONSOLIDATION_OUTPUT_CONTRACT,
      outputSchema: SOURCE_CONSOLIDATION_JSON_SCHEMA,
    };
  }

  async apply(
    tx: Prisma.TransactionClient,
    operation: GenerationOperation,
    result: GenerationProviderResult,
  ): Promise<void> {
    if (operation.sourceLanguageProposalId) {
      await this.applyLanguageChange(tx, operation, result);
      return;
    }
    const output = SourceConsolidationOutputSchema.parse(result.output);
    if (output.inputFingerprint !== operation.inputFingerprint) {
      throw new Error('Consolidation output fingerprint does not match input.');
    }
    if (!operation.sourceDocumentId) {
      throw new Error('Source consolidation requires a document.');
    }
    const observations = await tx.documentObservation.findMany({
      where: { sourceDocumentId: operation.sourceDocumentId },
      select: { id: true },
    });
    const known = new Set(observations.map(({ id }) => id));
    const seen = new Set<string>();
    for (const disposition of output.dispositions) {
      if (!known.has(disposition.observationId)) {
        throw new Error(
          `Consolidation references unknown observation ${disposition.observationId}.`,
        );
      }
      if (seen.has(disposition.observationId)) {
        throw new Error('Every observation requires exactly one disposition.');
      }
      seen.add(disposition.observationId);
    }
    if (seen.size !== known.size) {
      throw new Error('Every observation requires exactly one disposition.');
    }

    const materialConflicts = new Set(
      output.dispositions
        .filter(({ action }) => action === 'conflict' || action === 'open')
        .map(({ observationId }) => observationId),
    );
    const explainedConflicts = new Set(
      output.clarifications.map(
        ({ conflictObservationId }) => conflictObservationId,
      ),
    );
    if (
      materialConflicts.size !== explainedConflicts.size ||
      [...materialConflicts].some((id) => !explainedConflicts.has(id))
    ) {
      throw new Error(
        'Every material conflict requires exactly one clarification.',
      );
    }
    const evidenceIds = new Set(
      output.clarifications.flatMap(
        ({ evidenceObservationIds }) => evidenceObservationIds,
      ),
    );
    if ([...evidenceIds].some((id) => !known.has(id))) {
      throw new Error('Clarification references unknown evidence.');
    }

    const committed = await this.revisions.commitFromConsolidation(
      tx,
      operation,
      output.dispositions,
    );
    if (committed.status === 'committed') {
      await this.supersedeSettledClarifications(
        tx,
        committed.revisionId,
        output.dispositions,
      );
      await this.persistClarifications(
        tx,
        operation,
        committed.revisionId,
        output.clarifications,
      );
      return;
    }
    if (committed.status !== 'stale') {
      return;
    }

    const fingerprint = createHash('sha256')
      .update(
        `${operation.inputFingerprint}:${committed.currentRevisionId ?? 'empty'}`,
      )
      .digest('hex');
    await tx.generationOperation.upsert({
      where: {
        deduplicationKey: `source-consolidation:${operation.sourceDocumentId}:${committed.currentRevisionId ?? 'empty'}`,
      },
      update: {},
      create: {
        projectId: operation.projectId,
        type: 'source_consolidation',
        deduplicationKey: `source-consolidation:${operation.sourceDocumentId}:${committed.currentRevisionId ?? 'empty'}`,
        inputFingerprint: fingerprint,
        sourceDocumentId: operation.sourceDocumentId,
        baseSourceRevisionId: committed.currentRevisionId,
        promptVersion: SOURCE_CONSOLIDATION_PROMPT_VERSION,
        outputContractVersion: SOURCE_CONSOLIDATION_OUTPUT_CONTRACT,
        policySnapshot: operation.policySnapshot as Prisma.InputJsonValue,
        status: 'queued',
        replacesOperationId: operation.id,
      },
    });
  }

  private async supersedeSettledClarifications(
    tx: Prisma.TransactionClient,
    revisionId: string,
    dispositions: ConsolidationDisposition[],
  ): Promise<void> {
    const settledItemIds = dispositions.flatMap((disposition) =>
      disposition.action === 'supersede' && disposition.targetInformationItemId
        ? [disposition.targetInformationItemId]
        : [],
    );
    if (settledItemIds.length === 0) return;
    await tx.clarification.updateMany({
      where: {
        status: { in: ['open', 'left_open'] },
        items: {
          some: { informationItemId: { in: settledItemIds } },
        },
      },
      data: {
        status: 'superseded',
        resolvedInRevisionId: revisionId,
        version: { increment: 1 },
      },
    });
  }

  private async persistClarifications(
    tx: Prisma.TransactionClient,
    operation: GenerationOperation,
    revisionId: string,
    candidates: ClarificationCandidate[],
  ): Promise<void> {
    for (const candidate of candidates) {
      let informationItemIds = candidate.relatedInformationItemIds;
      if (informationItemIds.length === 0) {
        const openItem = await tx.sourceRevisionItem.findFirst({
          where: {
            sourceRevisionId: revisionId,
            provenanceLinks: {
              some: {
                documentObservationId: candidate.conflictObservationId,
              },
            },
          },
          select: { informationItemId: true },
        });
        if (!openItem) {
          throw new Error('Open clarification item was not committed.');
        }
        informationItemIds = [openItem.informationItemId];
      }
      await tx.clarification.create({
        data: {
          projectSource: {
            connect: { projectId: operation.projectId },
          },
          detectedInRevision: { connect: { id: revisionId } },
          question: candidate.question,
          impactRank: candidate.impactRank,
          impactExplanation: candidate.impactExplanation,
          items: {
            create: informationItemIds.map((informationItemId) => ({
              informationItemId,
            })),
          },
          evidence: {
            create: candidate.evidenceObservationIds.map(
              (documentObservationId) => ({ documentObservationId }),
            ),
          },
        },
      });
    }
  }

  private async buildLanguageChangeRequest(
    operation: GenerationOperation,
  ): Promise<GenerationRequestInput> {
    const proposal = await this.prisma.sourceLanguageProposal.findFirst({
      where: {
        id: operation.sourceLanguageProposalId!,
        projectSource: { projectId: operation.projectId },
        confirmedAt: { not: null },
      },
      include: {
        projectSource: {
          include: {
            currentRevision: {
              include: {
                items: {
                  include: { categories: true },
                  orderBy: { sortOrder: 'asc' },
                },
              },
            },
          },
        },
      },
    });
    if (
      !proposal ||
      proposal.expectedSourceRevisionId !==
        proposal.projectSource.currentRevisionId ||
      !proposal.expectedSourceRevisionId
    ) {
      throw new Error('Language change proposal is stale or unavailable.');
    }
    const items = proposal.projectSource.currentRevision?.items ?? [];
    return {
      parts: [
        {
          kind: 'text',
          text: buildSourceLanguageChangePrompt({
            fromLanguage: proposal.fromLanguage,
            toLanguage: proposal.toLanguage,
            inputFingerprint: operation.inputFingerprint,
            itemCount: items.length,
          }),
        },
        {
          kind: 'json',
          value: {
            items: items.map((item) => ({
              informationItemId: item.informationItemId,
              kind: item.kind,
              state: item.state,
              content: item.content,
              categories: item.categories.map(({ categoryKey }) => categoryKey),
            })),
          },
        },
      ],
      outputContract: SOURCE_LANGUAGE_CHANGE_OUTPUT_CONTRACT,
      outputSchema: SOURCE_LANGUAGE_CHANGE_JSON_SCHEMA,
    };
  }

  private async applyLanguageChange(
    tx: Prisma.TransactionClient,
    operation: GenerationOperation,
    result: GenerationProviderResult,
  ): Promise<void> {
    const output = SourceLanguageChangeOutputSchema.parse(result.output);
    if (output.inputFingerprint !== operation.inputFingerprint) {
      throw new Error('Language output fingerprint does not match input.');
    }
    const proposal = await tx.sourceLanguageProposal.findFirst({
      where: {
        id: operation.sourceLanguageProposalId!,
        projectSource: { projectId: operation.projectId },
        confirmedAt: { not: null },
      },
      include: { projectSource: true },
    });
    if (!proposal || !proposal.expectedSourceRevisionId) {
      throw new Error('Language change proposal is unavailable.');
    }
    const committed = await this.revisions.commitLanguageChange(tx, {
      projectId: operation.projectId,
      projectSourceId: proposal.projectSourceId,
      expectedSourceRevisionId: proposal.expectedSourceRevisionId,
      toLanguage: proposal.toLanguage,
      userId: proposal.createdByUserId,
      translations: output.items,
    });
    if (committed.status === 'stale') {
      throw new Error('Language change proposal became stale before commit.');
    }
  }
}
