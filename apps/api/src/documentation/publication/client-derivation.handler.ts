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
  buildRoadmapDerivationPrompt,
  CLIENT_DERIVATION_OUTPUT_CONTRACT,
  CLIENT_DERIVATION_PROMPT_VERSION,
  ROADMAP_DERIVATION_OUTPUT_CONTRACT,
  ROADMAP_DERIVATION_PROMPT_VERSION,
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

const DerivedSubstepSchema = z
  .object({
    when: z.string().trim().min(1).max(120).nullable(),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2_000).nullable(),
  })
  .strict();

export const RoadmapDerivationOutputSchema = z
  .object({
    promptVersion: z.literal(ROADMAP_DERIVATION_PROMPT_VERSION),
    locale: z.string().min(2).max(16),
    milestones: z.array(
      z
        .object({
          when: z.string().trim().min(1).max(120),
          title: z.string().trim().min(1).max(200),
          description: z.string().trim().max(2_000).nullable(),
          substeps: z.array(DerivedSubstepSchema),
        })
        .strict(),
    ),
  })
  .strict();

const ROADMAP_DERIVATION_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['promptVersion', 'locale', 'milestones'],
  properties: {
    promptVersion: { const: ROADMAP_DERIVATION_PROMPT_VERSION },
    locale: { type: 'string' },
    milestones: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['when', 'title', 'description', 'substeps'],
        properties: {
          when: { type: 'string' },
          title: { type: 'string' },
          description: { type: ['string', 'null'] },
          substeps: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['when', 'title', 'description'],
              properties: {
                when: { type: ['string', 'null'] },
                title: { type: 'string' },
                description: { type: ['string', 'null'] },
              },
            },
          },
        },
      },
    },
  },
};

interface SourceSubstep {
  id: string;
  when: string | null;
  title: string;
  description: string | null;
}

interface SourceMilestone {
  id: string;
  when: string;
  title: string;
  description: string | null;
  substeps?: SourceSubstep[];
}

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

    if (proposal.section.kind === 'roadmap') {
      return {
        parts: [
          {
            kind: 'text',
            text: buildRoadmapDerivationPrompt({
              sectionName: proposal.section.name,
              locale: 'fr',
              milestones: proposal.structuredContent,
            }),
          },
        ],
        outputContract: ROADMAP_DERIVATION_OUTPUT_CONTRACT,
        outputSchema: ROADMAP_DERIVATION_JSON_SCHEMA,
        maxOutputTokens: 8_000,
      };
    }

    const { length, pedagogy, technicalFamiliarity, tone } = proposal.section;
    if (!length || !pedagogy || !technicalFamiliarity || !tone)
      throw new Error('CLIENT_DERIVATION_REGISTER_MISSING');

    return {
      parts: [
        {
          kind: 'text',
          text: buildClientDerivationPrompt({
            sectionName: proposal.section.name,
            locale: 'fr',
            editorial: { length, pedagogy, technicalFamiliarity, tone },
            blocks: proposal.structuredContent,
          }),
        },
      ],
      outputContract: CLIENT_DERIVATION_OUTPUT_CONTRACT,
      outputSchema: CLIENT_DERIVATION_JSON_SCHEMA,
      maxOutputTokens: 8_000,
    };
  }
  private deriveProse(
    result: GenerationProviderResult,
    structuredContent: Prisma.JsonValue,
  ) {
    const output = ClientDerivationOutputSchema.parse(result.output);
    const sourceBlocks = (structuredContent ?? []) as Array<{
      kind?: string;
      openPointId?: string | null;
    }>;
    const expectedOpen = new Set(
      sourceBlocks
        .filter((block) => block.kind === 'open_point')
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
    return {
      locale: output.locale,
      outputContractVersion: CLIENT_DERIVATION_OUTPUT_CONTRACT,
      structuredContent: output.blocks as unknown as Prisma.InputJsonValue,
    };
  }

  // The ids stay on this side, at both levels. The model is sent an ordered
  // tree and must return one of the same shape; anything else is a roadmap that
  // lost or gained a step, which fails the operation rather than reaching the
  // client short.
  private deriveRoadmap(
    result: GenerationProviderResult,
    structuredContent: Prisma.JsonValue,
  ) {
    const output = RoadmapDerivationOutputSchema.parse(result.output);
    const source = (structuredContent ?? []) as unknown as SourceMilestone[];
    if (output.milestones.length !== source.length)
      throw new Error('CLIENT_DERIVATION_MILESTONE_COUNT');
    const milestones = source.map((milestone, index) => {
      const written = output.milestones[index];
      const sourceSubsteps = milestone.substeps ?? [];
      if (written.substeps.length !== sourceSubsteps.length)
        throw new Error('CLIENT_DERIVATION_MILESTONE_COUNT');
      return {
        id: milestone.id,
        when: written.when,
        title: written.title,
        description: written.description?.trim() ? written.description : null,
        substeps: sourceSubsteps.map((substep, substepIndex) => {
          const writtenSubstep = written.substeps[substepIndex];
          return {
            id: substep.id,
            // A substep with no date keeps none: giving it one here would be
            // the model inventing precision on the way to the client.
            when: writtenSubstep.when?.trim() ? writtenSubstep.when : null,
            title: writtenSubstep.title,
            description: writtenSubstep.description?.trim()
              ? writtenSubstep.description
              : null,
          };
        }),
      };
    });
    return {
      locale: output.locale,
      outputContractVersion: ROADMAP_DERIVATION_OUTPUT_CONTRACT,
      structuredContent: milestones as unknown as Prisma.InputJsonValue,
    };
  }

  async apply(
    tx: Prisma.TransactionClient,
    operation: GenerationOperation,
    result: GenerationProviderResult,
  ): Promise<void> {
    // No echoed fingerprint to compare: a result comes back on the attempt it
    // was submitted for, and applySuccessfulResult refuses an attempt that is
    // no longer the operation's current one. Copying 64 random characters back
    // verified nothing the plumbing did not already guarantee.
    if (!operation.sectionProposalId || !operation.clientReleaseId)
      throw new Error('CLIENT_DERIVATION_OUTPUT_MISMATCH');
    const proposal = await tx.sectionProposal.findUnique({
      where: { id: operation.sectionProposalId },
      select: {
        id: true,
        sectionId: true,
        structuredContent: true,
        section: { select: { kind: true } },
      },
    });
    if (!proposal) throw new Error('CLIENT_DERIVATION_INPUT_MISSING');

    const derived =
      proposal.section.kind === 'roadmap'
        ? this.deriveRoadmap(result, proposal.structuredContent)
        : this.deriveProse(result, proposal.structuredContent);

    const content = await tx.clientSectionContent.upsert({
      where: {
        sectionProposalId_locale_outputContractVersion: {
          sectionProposalId: proposal.id,
          locale: derived.locale,
          outputContractVersion: derived.outputContractVersion,
        },
      },
      update: {},
      create: {
        projectId: operation.projectId,
        sectionId: proposal.sectionId,
        sectionProposalId: proposal.id,
        locale: derived.locale,
        outputContractVersion: derived.outputContractVersion,
        structuredContent: derived.structuredContent,
      },
    });
    await tx.clientContentReleaseEntry.upsert({
      where: {
        releaseId_sectionId_locale: {
          releaseId: operation.clientReleaseId,
          sectionId: proposal.sectionId,
          locale: derived.locale,
        },
      },
      update: { clientSectionContentId: content.id },
      create: {
        releaseId: operation.clientReleaseId,
        sectionId: proposal.sectionId,
        locale: derived.locale,
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
