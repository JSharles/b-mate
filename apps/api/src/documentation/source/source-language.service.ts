import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ProjectLanguage } from '@prisma/client';
import { createHash } from 'node:crypto';
import { GenerationService } from '../../generation/generation.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectAccessService } from '../../projects/project-access.service';
import {
  SOURCE_LANGUAGE_CHANGE_OUTPUT_CONTRACT,
  SOURCE_LANGUAGE_CHANGE_PROMPT_VERSION,
} from './prompts/language-change.prompt';

export interface LanguageProposalInput {
  expectedSourceRevisionId: string | null;
  language: ProjectLanguage;
}

@Injectable()
export class SourceLanguageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly generation: GenerationService,
  ) {}

  async propose(
    userId: string,
    projectId: string,
    input: LanguageProposalInput,
  ) {
    await this.access.requireContributor(userId, projectId);
    const source = await this.prisma.projectSource.findUnique({
      where: { projectId },
    });
    if (!source) {
      this.hideNotFound();
    }
    if (source.currentRevisionId !== input.expectedSourceRevisionId) {
      throw new ConflictException({ code: 'STALE_SOURCE_REVISION' });
    }
    if (source.workingLanguage === input.language) {
      throw new BadRequestException({ code: 'LANGUAGE_UNCHANGED' });
    }
    const impactedItemCount = source.currentRevisionId
      ? await this.prisma.sourceRevisionItem.count({
          where: { sourceRevisionId: source.currentRevisionId },
        })
      : 0;
    const proposal = await this.prisma.sourceLanguageProposal.create({
      data: {
        projectSourceId: source.id,
        fromLanguage: source.workingLanguage,
        toLanguage: input.language,
        expectedSourceRevisionId: source.currentRevisionId,
        impactedItemCount,
        createdByUserId: userId,
      },
    });
    return proposalResponse(proposal);
  }

  async confirm(
    userId: string,
    projectId: string,
    proposalId: string,
    input: { confirmed: true },
  ): Promise<{
    operationId: string;
    status: 'queued' | 'running' | 'waiting_provider' | 'retry_scheduled';
  }> {
    await this.access.requireContributor(userId, projectId);
    if (input.confirmed !== true) {
      throw new BadRequestException({ code: 'CONFIRMATION_REQUIRED' });
    }
    return this.prisma.$transaction(async (tx) => {
      const source = await tx.projectSource.findUnique({
        where: { projectId },
      });
      if (!source) {
        this.hideNotFound();
      }
      const proposal = await tx.sourceLanguageProposal.findFirst({
        where: { id: proposalId, projectSourceId: source.id },
      });
      if (!proposal) {
        this.hideNotFound();
      }
      if (
        proposal.confirmedAt ||
        source.currentRevisionId !== proposal.expectedSourceRevisionId ||
        source.workingLanguage !== proposal.fromLanguage
      ) {
        throw new ConflictException({ code: 'STALE_SOURCE_REVISION' });
      }
      const claimed = await tx.sourceLanguageProposal.updateMany({
        where: {
          id: proposal.id,
          version: proposal.version,
          confirmedAt: null,
        },
        data: { confirmedAt: new Date(), version: { increment: 1 } },
      });
      if (claimed.count !== 1) {
        throw new ConflictException({ code: 'CONFLICT' });
      }
      const fingerprint = createHash('sha256')
        .update(
          `${proposal.id}:${proposal.expectedSourceRevisionId ?? 'empty'}:${proposal.toLanguage}`,
        )
        .digest('hex');
      const operation = await this.generation.createInTransaction(tx, {
        projectId,
        type: 'source_consolidation',
        deduplicationKey: `source-language-change:${proposal.id}:v${proposal.version}`,
        inputFingerprint: fingerprint,
        baseSourceRevisionId: proposal.expectedSourceRevisionId ?? undefined,
        sourceLanguageProposalId: proposal.id,
        promptVersion: SOURCE_LANGUAGE_CHANGE_PROMPT_VERSION,
        outputContractVersion: SOURCE_LANGUAGE_CHANGE_OUTPUT_CONTRACT,
      });
      if (
        operation.status !== 'queued' &&
        operation.status !== 'running' &&
        operation.status !== 'waiting_provider' &&
        operation.status !== 'retry_scheduled'
      ) {
        throw new ConflictException({ code: 'CONFLICT' });
      }
      return { operationId: operation.id, status: operation.status };
    });
  }

  private hideNotFound(): never {
    throw new NotFoundException({ code: 'NOT_FOUND' });
  }
}

function proposalResponse(proposal: {
  id: string;
  fromLanguage: ProjectLanguage;
  toLanguage: ProjectLanguage;
  expectedSourceRevisionId: string | null;
  impactedItemCount: number;
  version: number;
}) {
  return {
    id: proposal.id,
    fromLanguage: proposal.fromLanguage,
    toLanguage: proposal.toLanguage,
    expectedSourceRevisionId: proposal.expectedSourceRevisionId,
    impactedItemCount: proposal.impactedItemCount,
    version: proposal.version,
  };
}
