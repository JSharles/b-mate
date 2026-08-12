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
  ITEM_REF_JSON_SCHEMA,
  ItemRefSchema,
  itemRef,
  OBSERVATION_REF_JSON_SCHEMA,
  ObservationRefSchema,
  observationRef,
  resolveRef,
} from './reference-token';

// Only the observations that are *not* a plain addition. Asked instead for one
// record per observation plus counts that had to tally, the model kept losing
// its place: on a 61-observation page it miscounted, referenced an item that
// did not exist, and flagged conflicts it then failed to explain — a different
// bookkeeping slip on every run, none of them about judgement. Ledger-keeping
// is our job. What only the model can decide is which handful of facts are not
// simply new, and that is all it is asked for now.
const ConsolidationExceptionSchema = z
  .object({
    observationRef: ObservationRefSchema,
    action: z.enum(['support', 'supersede', 'conflict', 'open', 'exclude']),
    targetItemRef: ItemRefSchema.optional(),
    match: z.enum(['exact', 'semantic']).optional(),
    reason: z.string().trim().min(1).max(2_000),
  })
  .strict()
  .superRefine((value, context) => {
    const needsTarget = ['support', 'supersede', 'conflict'].includes(
      value.action,
    );
    if (needsTarget && !value.targetItemRef) {
      context.addIssue({
        code: 'custom',
        path: ['targetItemRef'],
        message: `${value.action} requires a target item.`,
      });
    }
  });

export const SourceConsolidationOutputSchema = z
  .object({
    promptVersion: z.literal(SOURCE_CONSOLIDATION_PROMPT_VERSION),
    exceptions: z.array(ConsolidationExceptionSchema),
    clarifications: z.array(ClarificationCandidateSchema),
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Set<string>();
    for (const [index, exception] of value.exceptions.entries()) {
      if (seen.has(exception.observationRef)) {
        context.addIssue({
          code: 'custom',
          path: ['exceptions', index, 'observationRef'],
          message: 'An observation can carry only one exception.',
        });
      }
      seen.add(exception.observationRef);
    }
  });

export const SOURCE_CONSOLIDATION_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['promptVersion', 'exceptions', 'clarifications'],
  properties: {
    promptVersion: { const: SOURCE_CONSOLIDATION_PROMPT_VERSION },
    exceptions: {
      type: 'array',
      description:
        'Only observations that are not plain additions. Anything left out is added.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['observationRef', 'action', 'reason'],
        properties: {
          observationRef: OBSERVATION_REF_JSON_SCHEMA,
          action: {
            enum: ['support', 'supersede', 'conflict', 'open', 'exclude'],
          },
          targetItemRef: ITEM_REF_JSON_SCHEMA,
          match: { enum: ['exact', 'semantic'] },
          reason: { type: 'string' },
        },
      },
    },
    clarifications: CLARIFICATION_JSON_SCHEMA,
  },
};

// Consolidation rewrites the whole canonical source from every observation
// gathered so far, so its answer only grows as a project accumulates
// documents. Same ceiling as extraction, and for the same reason: the budget
// has to cover the model's reasoning as well as the text it returns. No effort
// cap here — reconciling contradictions between documents is the one place in
// this pipeline where the reasoning is the work.
const CONSOLIDATION_MAX_OUTPUT_TOKENS = 64_000;

// The clarification as the model wrote it, with every reference turned back
// into the identifier it stands for.
type ResolvedClarification = Omit<
  ClarificationCandidate,
  'conflictObservationRef' | 'evidenceObservationRefs' | 'relatedItemRefs'
> & {
  conflictObservationId: string;
  evidenceObservationIds: string[];
  relatedInformationItemIds: string[];
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
            observationCount: observations.length,
            currentItemCount: source?.currentRevision?.items.length ?? 0,
          }),
        },
        {
          kind: 'json',
          value: {
            // Short references, not identifiers — see reference-token.ts. The
            // order is the contract: `apply` rebuilds the same references from
            // the same query, so nothing has to be carried between the two.
            currentItems:
              source?.currentRevision?.items.map((item, index) => ({
                ref: itemRef(index),
                kind: item.kind,
                state: item.state,
                content: item.content,
                categories: item.categories.map(
                  (category) => category.categoryKey,
                ),
              })) ?? [],
            observations: observations.map((observation, index) => ({
              ref: observationRef(index),
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
      maxOutputTokens: CONSOLIDATION_MAX_OUTPUT_TOKENS,
    };
  }

  async apply(
    tx: Prisma.TransactionClient,
    operation: GenerationOperation,
    result: GenerationProviderResult,
  ): Promise<void> {
    const output = SourceConsolidationOutputSchema.parse(result.output);
    // No echoed fingerprint to compare: a result comes back on the attempt it
    // was submitted for, and applySuccessfulResult refuses an attempt that is
    // no longer the operation's current one. Copying 64 random characters back
    // verified nothing the plumbing did not already guarantee.
    if (!operation.sourceDocumentId) {
      throw new Error('Source consolidation requires a document.');
    }
    // Rebuild the same reference map buildRequest handed out — same queries,
    // same order — then work in identifiers from here on. If the canonical head
    // moved underneath us an item reference will not resolve; that fails the
    // attempt loudly, where before the stale identifiers simply failed the
    // commit further down.
    const { observationIdByRef, itemIdByRef } = await this.referenceMaps(
      tx,
      operation.projectId,
      operation.sourceDocumentId,
    );
    // Every observation the model did not single out is a plain addition. It
    // used to have to say so, once per observation, and count them.
    const exceptionByObservation = new Map(
      output.exceptions.map((exception) => [
        resolveRef(observationIdByRef, exception.observationRef, 'observation'),
        exception,
      ]),
    );
    const dispositions = [...observationIdByRef.values()].map(
      (observationId) => {
        const exception = exceptionByObservation.get(observationId);
        if (!exception) {
          return {
            observationId,
            action: 'add' as const,
            reason:
              'New information with no counterpart in the canonical source.',
          };
        }
        return {
          observationId,
          action: exception.action,
          match: exception.match,
          reason: exception.reason,
          targetInformationItemId: exception.targetItemRef
            ? resolveRef(itemIdByRef, exception.targetItemRef, 'item')
            : undefined,
        };
      },
    );
    const clarifications = output.clarifications.map((clarification) => ({
      ...clarification,
      conflictObservationId: resolveRef(
        observationIdByRef,
        clarification.conflictObservationRef,
        'observation',
      ),
      evidenceObservationIds: clarification.evidenceObservationRefs.map((ref) =>
        resolveRef(observationIdByRef, ref, 'observation'),
      ),
      relatedInformationItemIds: clarification.relatedItemRefs.map((ref) =>
        resolveRef(itemIdByRef, ref, 'item'),
      ),
    }));

    const materialConflicts = new Set(
      dispositions
        .filter(({ action }) => action === 'conflict' || action === 'open')
        .map(({ observationId }) => observationId),
    );
    const explainedConflicts = new Set(
      clarifications.map(({ conflictObservationId }) => conflictObservationId),
    );
    if (
      materialConflicts.size !== explainedConflicts.size ||
      [...materialConflicts].some((id) => !explainedConflicts.has(id))
    ) {
      throw new Error(
        'Every material conflict requires exactly one clarification.',
      );
    }

    const committed = await this.revisions.commitFromConsolidation(
      tx,
      operation,
      dispositions,
    );
    if (committed.status === 'committed') {
      await this.supersedeSettledClarifications(
        tx,
        committed.revisionId,
        dispositions,
      );
      await this.persistClarifications(
        tx,
        operation,
        committed.revisionId,
        clarifications,
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

  // Extraction had this and consolidation did not, so a consolidation that
  // gave up left the document in `incorporating` with nothing running — the
  // row spun forever and nothing in the interface said otherwise.
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
        status: { in: ['ready_to_consolidate', 'incorporating'] },
      },
      data: { status: 'failed', failureCode },
    });
  }

  // The mirror of what buildRequest handed the model: same queries, same
  // order, so `o12` means the same observation on both sides without anything
  // being carried between the two calls.
  private async referenceMaps(
    tx: Prisma.TransactionClient,
    projectId: string,
    sourceDocumentId: string,
  ): Promise<{
    observationIdByRef: Map<string, string>;
    itemIdByRef: Map<string, string>;
  }> {
    const observations = await tx.documentObservation.findMany({
      where: { sourceDocumentId },
      select: { id: true },
      orderBy: { sequence: 'asc' },
    });
    const source = await tx.projectSource.findUnique({
      where: { projectId },
      include: {
        currentRevision: {
          include: { items: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
    return {
      observationIdByRef: new Map(
        observations.map(({ id }, index) => [observationRef(index), id]),
      ),
      itemIdByRef: new Map(
        (source?.currentRevision?.items ?? []).map((item, index) => [
          itemRef(index),
          item.informationItemId,
        ]),
      ),
    };
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
    candidates: ResolvedClarification[],
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
}
