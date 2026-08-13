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
import { buildCompositionPrompt } from '../sections/prompts/composition.prompt';
import type { CompositionPromptStatement } from '../sections/prompts/composition.prompt';
import {
  SECTION_COMPOSITION_JSON_SCHEMA,
  SECTION_COMPOSITION_OUTPUT_CONTRACT,
  SectionCompositionOutputSchema,
  validateCompositionReferences,
} from './composition-output.schema';

export interface CompositionInput {
  sectionId: string;
  sectionName: string;
  instructions: string;
  sourceRevisionId: string;
  statements: CompositionPromptStatement[];
}

// One definition of what the input is, used both when the operation is queued
// and when its request is built. Two hand-kept copies of this shape is exactly
// how a stage starts refusing its own work for drift it invented itself.
export function compositionFingerprint(input: CompositionInput): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        sectionId: input.sectionId,
        sectionName: input.sectionName,
        instructions: input.instructions,
        sourceRevisionId: input.sourceRevisionId,
        statements: input.statements,
      }),
    )
    .digest('hex');
}

// FR-015/FR-016 are enforced here rather than asked for in the prompt: an
// excluded statement is removed from the input before the model sees it, so a
// contributor's judgement cannot be forgotten by a model that never received
// it. `excludedItemIds` is empty until US2 introduces exclusions; the filter
// exists now so there is one place for it to arrive.
export function selectCompositionStatements(
  items: readonly {
    informationItemId: string;
    kind: CompositionPromptStatement['kind'];
    state: CompositionPromptStatement['state'];
    content: string;
  }[],
  excludedItemIds: ReadonlySet<string> = new Set(),
): CompositionPromptStatement[] {
  return items
    .filter((item) => !excludedItemIds.has(item.informationItemId))
    .map((item) => ({
      id: item.informationItemId,
      kind: item.kind,
      state: item.state,
      content: item.content,
    }));
}

@Injectable()
export class SectionCompositionHandler
  implements GenerationHandler, OnModuleInit
{
  readonly type = 'section_composition' as const;

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
    const proposal = await this.prisma.sectionProposal.findUnique({
      where: { generationOperationId: operation.id },
      include: {
        section: true,
        // Ordered the same way the proposal service ordered them when it
        // queued the work: an unordered read makes the fingerprint differ from
        // the one recorded, and the stage refuses its own input as drift.
        sourceRevision: {
          include: { items: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
    if (!proposal || proposal.status !== 'composing') {
      throw new Error('SECTION_COMPOSITION_NOT_CURRENT');
    }
    // A section archived while its composition was queued has nothing left to
    // compose for.
    if (proposal.section.archivedAt) {
      throw new Error('SECTION_COMPOSITION_NOT_CURRENT');
    }

    const statements = selectCompositionStatements(
      proposal.sourceRevision.items,
    );
    const input: CompositionInput = {
      sectionId: proposal.sectionId,
      sectionName: proposal.section.name,
      instructions: proposal.section.instructions,
      sourceRevisionId: proposal.sourceRevisionId,
      statements,
    };
    if (compositionFingerprint(input) !== operation.inputFingerprint) {
      throw new Error('SECTION_COMPOSITION_INPUT_DRIFT');
    }

    return {
      parts: [{ kind: 'text', text: buildCompositionPrompt(input) }],
      outputContract: SECTION_COMPOSITION_OUTPUT_CONTRACT,
      outputSchema: SECTION_COMPOSITION_JSON_SCHEMA,
      maxOutputTokens: 8_000,
    };
  }

  async apply(
    tx: Prisma.TransactionClient,
    operation: GenerationOperation,
    result: GenerationProviderResult,
  ): Promise<void> {
    const output = SectionCompositionOutputSchema.parse(result.output);
    const proposal = await tx.sectionProposal.findUnique({
      where: { generationOperationId: operation.id },
      include: { sourceRevision: { include: { items: true } } },
    });
    if (!proposal || proposal.status !== 'composing') {
      throw new Error('SECTION_COMPOSITION_NOT_CURRENT');
    }

    validateCompositionReferences(
      output,
      proposal.sourceRevision.items.map((item) => item.informationItemId),
    );

    await tx.sectionProposal.update({
      where: { id: proposal.id },
      data: {
        status: 'pending_review',
        outcome: output.outcome,
        structuredContent: output.blocks,
        changeSummary: output.changeSummary,
        provenanceSummary: output.provenanceSummary,
        failureCode: null,
        version: { increment: 1 },
      },
    });

    // Questions are written as rows rather than folded into the content, so the
    // contributor reads them apart from what is proposed (FR-010) and can answer
    // one without touching the other.
    for (const [index, question] of output.questions.entries()) {
      const created = await tx.sectionQuestion.create({
        data: {
          proposalId: proposal.id,
          question: question.question,
          impactExplanation: question.impactExplanation,
          sortOrder: index,
        },
      });
      if (question.informationItemIds.length > 0) {
        await tx.sectionQuestionItem.createMany({
          data: question.informationItemIds.map((informationItemId) => ({
            questionId: created.id,
            informationItemId,
          })),
          skipDuplicates: true,
        });
      }
    }

    // The section has now been composed against the current head, so it no
    // longer needs a refresh. A later canonical change sets it again (FR-018).
    await tx.clientSection.update({
      where: { id: proposal.sectionId },
      data: { refreshNeeded: false, version: { increment: 1 } },
    });
  }

  // A section holds one composition slot at a time. Nothing else releases it,
  // so a generation that dies has to hand it back here — otherwise the section
  // sits on "composing" forever and every later refresh finds the slot taken.
  // That is the failure that pinned three categories for a day on 2026-08-11.
  async onTerminalFailure(
    tx: Prisma.TransactionClient,
    operation: GenerationOperation,
    failureCode: string,
  ): Promise<void> {
    const proposal = await tx.sectionProposal.findFirst({
      where: { generationOperationId: operation.id, status: 'composing' },
      select: { id: true, sectionId: true },
    });
    if (!proposal) return;
    await tx.sectionProposal.update({
      where: { id: proposal.id },
      data: { status: 'failed', failureCode, version: { increment: 1 } },
    });
    // The section keeps whatever it had approved, so the client goes on reading
    // it while the contributor retries (Edge Cases).
    await tx.clientSection.updateMany({
      where: { id: proposal.sectionId, activeProposalId: proposal.id },
      data: { activeProposalId: null, version: { increment: 1 } },
    });
  }
}
