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
  buildClientDerivationPrompt,
  CLIENT_DERIVATION_OUTPUT_CONTRACT,
  CLIENT_DERIVATION_PROMPT_VERSION,
} from './prompts/client-derivation.prompt';

export const ClientDerivationOutputSchema = z
  .object({
    promptVersion: z.literal(CLIENT_DERIVATION_PROMPT_VERSION),
    locale: z.string().min(2).max(16),
    blocks: z.array(
      z
        .object({
          type: z.enum(['paragraph', 'bullet', 'open_point']),
          text: z.string().trim().min(1).max(20_000),
          openPointId: z.string().trim().min(1).max(128).nullable().optional(),
        })
        .strict(),
    ),
  })
  .strict();

const CLIENT_DERIVATION_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['promptVersion', 'locale', 'blocks'],
  properties: {
    promptVersion: { const: CLIENT_DERIVATION_PROMPT_VERSION },
    locale: { type: 'string' },
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
export class ClientDerivationHandler
  implements GenerationHandler, OnModuleInit
{
  readonly type = 'client_derivation' as const;
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
    if (!operation.sectionProposalId)
      throw new Error('CLIENT_DERIVATION_LINKS_MISSING');
    const proposal = await this.prisma.sectionProposal.findUnique({
      where: { id: operation.sectionProposalId },
      include: { section: true },
    });
    if (!proposal || proposal.status !== 'approved')
      throw new Error('CLIENT_DERIVATION_INPUT_MISSING');
    return {
      parts: [
        {
          kind: 'text',
          text: buildClientDerivationPrompt({
            sectionName: proposal.section.name,
            locale: 'fr',
            editorial: {
              length: proposal.section.length,
              pedagogy: proposal.section.pedagogy,
              technicalFamiliarity: proposal.section.technicalFamiliarity,
              tone: proposal.section.tone,
            },
            blocks: proposal.structuredContent,
          }),
        },
      ],
      outputContract: CLIENT_DERIVATION_OUTPUT_CONTRACT,
      outputSchema: CLIENT_DERIVATION_JSON_SCHEMA,
      maxOutputTokens: 8_000,
    };
  }
  async apply(
    tx: Prisma.TransactionClient,
    operation: GenerationOperation,
    result: GenerationProviderResult,
  ): Promise<void> {
    const output = ClientDerivationOutputSchema.parse(result.output);
    // No echoed fingerprint to compare: a result comes back on the attempt it
    // was submitted for, and applySuccessfulResult refuses an attempt that is
    // no longer the operation's current one. Copying 64 random characters back
    // verified nothing the plumbing did not already guarantee.
    if (!operation.sectionProposalId || !operation.clientReleaseId)
      throw new Error('CLIENT_DERIVATION_OUTPUT_MISMATCH');
    const proposal = await tx.sectionProposal.findUnique({
      where: { id: operation.sectionProposalId },
      select: { id: true, sectionId: true, structuredContent: true },
    });
    if (!proposal) throw new Error('CLIENT_DERIVATION_INPUT_MISSING');
    const sourceBlocks = proposal.structuredContent as Array<{
      type?: string;
      openPointId?: string | null;
    }>;
    const expectedOpen = new Set(
      sourceBlocks
        .filter((block) => block.type === 'open_point')
        .map((block) => block.openPointId)
        .filter((id): id is string => Boolean(id)),
    );
    const actualOpen = new Set(
      output.blocks
        .filter((block) => block.type === 'open_point')
        .map((block) => block.openPointId)
        .filter((id): id is string => Boolean(id)),
    );
    if (
      expectedOpen.size !== actualOpen.size ||
      [...expectedOpen].some((id) => !actualOpen.has(id))
    )
      throw new Error('CLIENT_DERIVATION_OPEN_POINT_COVERAGE');
    const content = await tx.clientSectionContent.upsert({
      where: {
        sectionProposalId_locale_outputContractVersion: {
          sectionProposalId: proposal.id,
          locale: output.locale,
          outputContractVersion: CLIENT_DERIVATION_OUTPUT_CONTRACT,
        },
      },
      update: {},
      create: {
        projectId: operation.projectId,
        sectionId: proposal.sectionId,
        sectionProposalId: proposal.id,
        locale: output.locale,
        outputContractVersion: CLIENT_DERIVATION_OUTPUT_CONTRACT,
        structuredContent: output.blocks,
      },
    });
    await tx.clientContentReleaseEntry.upsert({
      where: {
        releaseId_sectionId_locale: {
          releaseId: operation.clientReleaseId,
          sectionId: proposal.sectionId,
          locale: output.locale,
        },
      },
      update: { clientSectionContentId: content.id },
      create: {
        releaseId: operation.clientReleaseId,
        sectionId: proposal.sectionId,
        locale: output.locale,
        clientSectionContentId: content.id,
      },
    });
    const release = await tx.clientContentRelease.findUnique({
      where: { id: operation.clientReleaseId },
      include: { entries: true },
    });
    if (
      !release ||
      ['published', 'superseded', 'failed'].includes(release.status)
    )
      return;
    if (release.entries.length >= release.expectedSectionCount) {
      // Claim the head first, and only on the base this release was built
      // from. Read then write, four sections approved within seconds of each
      // other each saw the same head, and two of them published: the client was
      // left with two live releases between them covering half the sections.
      // The condition is what makes the swap a swap.
      const claimed = await tx.projectClientPublication.updateMany({
        where: {
          projectId: operation.projectId,
          currentReleaseId: release.baseReleaseId,
        },
        data: { currentReleaseId: release.id, version: { increment: 1 } },
      });
      if (claimed.count !== 1) {
        // Someone else moved the head. This release was built on a version of
        // the truth that is no longer current, so it never goes live.
        await tx.clientContentRelease.update({
          where: { id: release.id },
          data: { status: 'superseded' },
        });
        return;
      }
      await tx.clientContentRelease.update({
        where: { id: release.id },
        data: {
          status: 'published',
          readyAt: new Date(),
          publishedAt: new Date(),
        },
      });
      if (release.baseReleaseId)
        await tx.clientContentRelease.updateMany({
          where: { id: release.baseReleaseId, status: 'published' },
          data: { status: 'superseded' },
        });
    }
  }
}
