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
import type { CompositionPromptPart } from '../sections/prompts/composition.prompt';
import {
  SECTION_COMPOSITION_JSON_SCHEMA,
  SECTION_COMPOSITION_OUTPUT_CONTRACT,
  SectionCompositionOutputSchema,
} from './composition-output.schema';

export interface CompositionInput {
  sectionId: string;
  sectionName: string;
  instructions: string;
  referenceDocumentId: string;
  referenceVersion: number;
}

// One definition of what the input is, used both when the operation is queued
// and when its request is built. Two hand-kept copies of this shape is exactly
// how a stage starts refusing its own work for drift it invented itself.
export function compositionFingerprint(input: CompositionInput): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

// The document as the model should read it. A gap keeps its own kind, so the
// section can carry it forward as an open point instead of quietly writing a
// sentence that reads as settled.
export function compositionParts(
  structuredContent: unknown,
): CompositionPromptPart[] {
  const parts = (structuredContent ?? []) as {
    title: string;
    blocks: { kind: 'paragraph' | 'gap'; text: string }[];
  }[];
  return parts.map((part) => ({
    title: part.title,
    blocks: part.blocks.map((block) => ({
      kind: block.kind,
      text: block.text,
    })),
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
      include: { section: true, referenceDocument: true },
    });
    if (!proposal || proposal.status !== 'composing') {
      throw new Error('SECTION_COMPOSITION_NOT_CURRENT');
    }
    // A section archived while its composition was queued has nothing left to
    // compose for.
    if (proposal.section.archivedAt) {
      throw new Error('SECTION_COMPOSITION_NOT_CURRENT');
    }

    const input: CompositionInput = {
      sectionId: proposal.sectionId,
      sectionName: proposal.section.name,
      instructions: proposal.section.instructions,
      referenceDocumentId: proposal.referenceDocumentId,
      referenceVersion: proposal.referenceDocument.version,
    };
    if (compositionFingerprint(input) !== operation.inputFingerprint) {
      throw new Error('SECTION_COMPOSITION_INPUT_DRIFT');
    }

    return {
      parts: [
        {
          kind: 'text',
          text: buildCompositionPrompt({
            sectionName: input.sectionName,
            instructions: input.instructions,
            parts: compositionParts(
              proposal.referenceDocument.structuredContent,
            ),
          }),
        },
      ],
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
    });
    if (!proposal || proposal.status !== 'composing') {
      throw new Error('SECTION_COMPOSITION_NOT_CURRENT');
    }

    await tx.sectionProposal.update({
      where: { id: proposal.id },
      data: {
        status: 'pending_review',
        outcome: output.outcome,
        structuredContent: output.blocks,
        changeSummary: output.changeSummary,
        failureCode: null,
        version: { increment: 1 },
      },
    });

    // Questions are written as rows rather than folded into the content, so the
    // contributor reads them apart from what is proposed (FR-010) and can act on
    // one without touching the other.
    for (const [index, question] of output.questions.entries()) {
      await tx.sectionQuestion.create({
        data: {
          proposalId: proposal.id,
          question: question.question,
          impactExplanation: question.impactExplanation,
          sortOrder: index,
        },
      });
    }

    // The section has now been composed against the current reference document,
    // so it no longer needs a refresh. A later rewrite sets it again (FR-018).
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
