import { Injectable, OnModuleInit } from '@nestjs/common';
import type { GenerationOperation, Prisma } from '@prisma/client';
import { z } from 'zod';
import type { GenerationProviderResult } from '../../generation/adapters/generation-provider';
import type {
  GenerationHandler,
  GenerationRequestInput,
} from '../../generation/generation-handler.registry';
import { GenerationHandlerRegistry } from '../../generation/generation-handler.registry';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildEditorialPreviewPrompt,
  EDITORIAL_PREVIEW_OUTPUT_CONTRACT,
  EDITORIAL_PREVIEW_PROMPT_VERSION,
} from './prompts/editorial-preview.prompt';

const EditorialPreviewOutputSchema = z
  .object({
    promptVersion: z.literal(EDITORIAL_PREVIEW_PROMPT_VERSION),
    inputFingerprint: z.string().regex(/^[0-9a-f]{64}$/u),
    categoryKey: z.enum(['overview', 'how_it_works', 'planning', 'other']),
    blocks: z.array(
      z
        .object({
          type: z.enum(['paragraph', 'bullet', 'open_point']),
          text: z.string().trim().min(1).max(20_000),
          openPointId: z.string().nullable().optional(),
        })
        .strict(),
    ),
  })
  .strict();
const schema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['promptVersion', 'inputFingerprint', 'categoryKey', 'blocks'],
  properties: {
    promptVersion: { const: EDITORIAL_PREVIEW_PROMPT_VERSION },
    inputFingerprint: { type: 'string', pattern: '^[0-9a-f]{64}$' },
    categoryKey: { enum: ['overview', 'how_it_works', 'planning', 'other'] },
    blocks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'text'],
        properties: {
          type: { enum: ['paragraph', 'bullet', 'open_point'] },
          text: { type: 'string' },
          openPointId: { type: ['string', 'null'] },
        },
      },
    },
  },
};

@Injectable()
export class EditorialPreviewHandler
  implements GenerationHandler, OnModuleInit
{
  readonly type = 'editorial_preview' as const;
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
    if (!operation.profileProposalId)
      throw new Error('EDITORIAL_PROPOSAL_MISSING');
    const proposal = await this.prisma.editorialProfileProposal.findUnique({
      where: { id: operation.profileProposalId },
      include: { representativeCategoryReference: true },
    });
    if (
      !proposal?.representativeCategoryReference ||
      proposal.status !== 'preview_pending'
    )
      throw new Error('EDITORIAL_PREVIEW_NOT_CURRENT');
    return {
      parts: [
        {
          kind: 'text',
          text: buildEditorialPreviewPrompt({
            categoryKey: proposal.representativeCategoryReference.categoryKey,
            inputFingerprint: operation.inputFingerprint,
            factualBlocks:
              proposal.representativeCategoryReference.structuredContent,
            profile: {
              length: proposal.length,
              pedagogy: proposal.pedagogy,
              technicalFamiliarity: proposal.technicalFamiliarity,
              tone: proposal.tone,
              guidance: proposal.guidance,
            },
          }),
        },
      ],
      outputContract: EDITORIAL_PREVIEW_OUTPUT_CONTRACT,
      outputSchema: schema,
      maxOutputTokens: 4_000,
    };
  }
  async apply(
    tx: Prisma.TransactionClient,
    operation: GenerationOperation,
    result: GenerationProviderResult,
  ): Promise<void> {
    const output = EditorialPreviewOutputSchema.parse(result.output);
    if (
      output.inputFingerprint !== operation.inputFingerprint ||
      !operation.profileProposalId
    )
      throw new Error('EDITORIAL_PREVIEW_OUTPUT_MISMATCH');
    const proposal = await tx.editorialProfileProposal.findUnique({
      where: { id: operation.profileProposalId },
      include: { representativeCategoryReference: true },
    });
    if (
      !proposal?.representativeCategoryReference ||
      proposal.representativeCategoryReference.categoryKey !==
        output.categoryKey
    )
      throw new Error('EDITORIAL_PREVIEW_NOT_CURRENT');
    const sourceBlocks = proposal.representativeCategoryReference
      .structuredContent as Array<{
      type?: string;
      openPointId?: string | null;
    }>;
    const expected = new Set(
      sourceBlocks
        .filter((block) => block.type === 'open_point')
        .map((block) => block.openPointId)
        .filter((id): id is string => Boolean(id)),
    );
    const actual = new Set(
      output.blocks
        .filter((block) => block.type === 'open_point')
        .map((block) => block.openPointId)
        .filter((id): id is string => Boolean(id)),
    );
    if (
      expected.size !== actual.size ||
      [...expected].some((id) => !actual.has(id))
    )
      throw new Error('EDITORIAL_PREVIEW_OPEN_POINT_COVERAGE');
    await tx.editorialPreview.update({
      where: { proposalId: proposal.id },
      data: {
        beforeContentJson: {
          categoryKey: proposal.representativeCategoryReference.categoryKey,
          blocks: proposal.representativeCategoryReference.structuredContent,
        },
        afterContentJson: {
          categoryKey: output.categoryKey,
          blocks: output.blocks,
        },
      },
    });
    await tx.editorialProfileProposal.update({
      where: { id: proposal.id },
      data: { status: 'preview_ready', version: { increment: 1 } },
    });
  }
}
