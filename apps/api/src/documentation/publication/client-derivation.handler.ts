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
    categoryKey: z.enum(['overview', 'how_it_works', 'planning', 'other']),
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
  required: ['promptVersion', 'categoryKey', 'locale', 'blocks'],
  properties: {
    promptVersion: { const: CLIENT_DERIVATION_PROMPT_VERSION },
    categoryKey: { enum: ['overview', 'how_it_works', 'planning', 'other'] },
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
    if (!operation.categoryReferenceId || !operation.profileRevisionId)
      throw new Error('CLIENT_DERIVATION_LINKS_MISSING');
    const [reference, profile] = await Promise.all([
      this.prisma.documentationCategoryReference.findUnique({
        where: { id: operation.categoryReferenceId },
      }),
      this.prisma.editorialProfileRevision.findUnique({
        where: { id: operation.profileRevisionId },
      }),
    ]);
    if (!reference || !profile)
      throw new Error('CLIENT_DERIVATION_INPUT_MISSING');
    return {
      parts: [
        {
          kind: 'text',
          text: buildClientDerivationPrompt({
            categoryKey: reference.categoryKey,
            locale: 'fr',
            profile: {
              length: profile.length,
              pedagogy: profile.pedagogy,
              technicalFamiliarity: profile.technicalFamiliarity,
              tone: profile.tone,
              guidance: profile.guidance,
            },
            blocks: reference.structuredContent,
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
    if (
      !operation.categoryReferenceId ||
      !operation.profileRevisionId ||
      !operation.clientReleaseId
    )
      throw new Error('CLIENT_DERIVATION_OUTPUT_MISMATCH');
    const reference = await tx.documentationCategoryReference.findUnique({
      where: { id: operation.categoryReferenceId },
    });
    if (!reference || reference.categoryKey !== output.categoryKey)
      throw new Error('CLIENT_DERIVATION_CATEGORY_MISMATCH');
    const sourceBlocks = reference.structuredContent as Array<{
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
    const content = await tx.clientCategoryContent.upsert({
      where: {
        categoryReferenceId_editorialProfileRevisionId_locale_outputContractVersion:
          {
            categoryReferenceId: reference.id,
            editorialProfileRevisionId: operation.profileRevisionId,
            locale: output.locale,
            outputContractVersion: CLIENT_DERIVATION_OUTPUT_CONTRACT,
          },
      },
      update: {},
      create: {
        projectId: operation.projectId,
        categoryKey: reference.categoryKey,
        categoryReferenceId: reference.id,
        editorialProfileRevisionId: operation.profileRevisionId,
        locale: output.locale,
        outputContractVersion: CLIENT_DERIVATION_OUTPUT_CONTRACT,
        structuredContent: output.blocks,
        validationResult: { valid: true },
      },
    });
    await tx.clientContentReleaseEntry.upsert({
      where: {
        releaseId_categoryKey_locale: {
          releaseId: operation.clientReleaseId,
          categoryKey: reference.categoryKey,
          locale: output.locale,
        },
      },
      update: { clientCategoryContentId: content.id },
      create: {
        releaseId: operation.clientReleaseId,
        categoryKey: reference.categoryKey,
        locale: output.locale,
        clientCategoryContentId: content.id,
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
    if (release.entries.length >= release.expectedCategoryCount) {
      const current = await tx.projectClientPublication.findUnique({
        where: { projectId: operation.projectId },
      });
      if (release.baseReleaseId !== current?.currentReleaseId) {
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
      await tx.projectClientPublication.update({
        where: { projectId: operation.projectId },
        data: { currentReleaseId: release.id, version: { increment: 1 } },
      });
    }
  }
}
