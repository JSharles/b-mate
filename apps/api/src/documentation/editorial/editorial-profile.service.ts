import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { GenerationService } from '../../generation/generation.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectAccessService } from '../../projects/project-access.service';
import { ClientPublicationService } from '../publication/client-publication.service';
import {
  EDITORIAL_PREVIEW_OUTPUT_CONTRACT,
  EDITORIAL_PREVIEW_PROMPT_VERSION,
} from './prompts/editorial-preview.prompt';
import type { EditorialProfileValues } from './prompts/editorial-preview.prompt';

const DEFAULT_PROFILE: EditorialProfileValues = {
  length: 'balanced',
  pedagogy: 'guided',
  technicalFamiliarity: 'novice',
  tone: 'reassuring',
  guidance: null,
};
@Injectable()
export class EditorialProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly generation: GenerationService,
    private readonly publication: ClientPublicationService,
  ) {}
  async get(userId: string, projectId: string) {
    await this.access.requireContributor(userId, projectId);
    const settings = await this.prisma.projectEditorialSettings.findUnique({
      where: { projectId },
      include: {
        currentProfileRevision: true,
        activeProposal: { include: { preview: true } },
      },
    });
    const profile = settings?.currentProfileRevision;
    return {
      revisionId: profile?.id ?? null,
      sequence: profile?.sequence ?? 0,
      version: settings?.version ?? 1,
      ...(profile
        ? {
            length: profile.length,
            pedagogy: profile.pedagogy,
            technicalFamiliarity: profile.technicalFamiliarity,
            tone: profile.tone,
            guidance: profile.guidance,
          }
        : DEFAULT_PROFILE),
      proposal: settings?.activeProposal
        ? this.proposalView(settings.activeProposal)
        : null,
    };
  }
  async propose(
    userId: string,
    projectId: string,
    expectedVersion: number,
    values: EditorialProfileValues,
  ) {
    await this.access.requireContributor(userId, projectId);
    return this.prisma.$transaction(
      async (tx) => {
        const settings = await tx.projectEditorialSettings.upsert({
          where: { projectId },
          update: {},
          create: { projectId },
        });
        if (settings.version !== expectedVersion)
          throw new ConflictException({ code: 'STALE_EDITORIAL_PROFILE' });
        if (settings.activeProposalId)
          await tx.editorialProfileProposal.updateMany({
            where: {
              id: settings.activeProposalId,
              status: { in: ['preview_pending', 'preview_ready'] },
            },
            data: { status: 'cancelled', version: { increment: 1 } },
          });
        const reference = await tx.documentationCategoryReference.findFirst({
          where: { projectId },
          orderBy: { acceptedAt: 'desc' },
        });
        const proposal = await tx.editorialProfileProposal.create({
          data: {
            projectId,
            baseProfileRevisionId: settings.currentProfileRevisionId,
            status: reference ? 'preview_pending' : 'saved_without_preview',
            ...values,
            representativeCategoryReferenceId: reference?.id,
            createdByUserId: userId,
          },
        });
        await tx.projectEditorialSettings.update({
          where: { projectId },
          data: { activeProposalId: proposal.id, version: { increment: 1 } },
        });
        if (!reference)
          return this.proposalView({ ...proposal, preview: null });
        const inputFingerprint = createHash('sha256')
          .update(JSON.stringify({ referenceId: reference.id, values }))
          .digest('hex');
        const operation = await this.generation.createInTransaction(tx, {
          projectId,
          type: 'editorial_preview',
          deduplicationKey: `editorial-preview:${proposal.id}:${proposal.version}`,
          inputFingerprint,
          promptVersion: EDITORIAL_PREVIEW_PROMPT_VERSION,
          outputContractVersion: EDITORIAL_PREVIEW_OUTPUT_CONTRACT,
          profileProposalId: proposal.id,
          categoryReferenceId: reference.id,
        });
        await tx.editorialPreview.create({
          data: {
            proposalId: proposal.id,
            generationOperationId: operation.id,
          },
        });
        return this.proposalView({ ...proposal, preview: null });
      },
      { isolationLevel: 'Serializable' },
    );
  }
  async cancel(
    userId: string,
    projectId: string,
    proposalId: string,
    expectedVersion: number,
  ) {
    await this.access.requireContributor(userId, projectId);
    const updated = await this.prisma.editorialProfileProposal.updateMany({
      where: {
        id: proposalId,
        projectId,
        version: expectedVersion,
        status: {
          in: ['preview_pending', 'preview_ready', 'saved_without_preview'],
        },
      },
      data: { status: 'cancelled', version: { increment: 1 } },
    });
    if (updated.count !== 1)
      throw new ConflictException({ code: 'STALE_EDITORIAL_PROPOSAL' });
    await this.prisma.projectEditorialSettings.updateMany({
      where: { projectId, activeProposalId: proposalId },
      data: { activeProposalId: null, version: { increment: 1 } },
    });
    return { cancelled: true };
  }
  async confirm(
    userId: string,
    projectId: string,
    proposalId: string,
    expectedVersion: number,
  ) {
    await this.access.requireContributor(userId, projectId);
    const profile = await this.prisma.$transaction(
      async (tx) => {
        const proposal = await tx.editorialProfileProposal.findFirst({
          where: {
            id: proposalId,
            projectId,
            version: expectedVersion,
            status: { in: ['preview_ready', 'saved_without_preview'] },
          },
        });
        const settings = await tx.projectEditorialSettings.findUnique({
          where: { projectId },
        });
        if (!proposal || !settings || settings.activeProposalId !== proposal.id)
          throw new ConflictException({ code: 'STALE_EDITORIAL_PROPOSAL' });
        const profile = await tx.editorialProfileRevision.create({
          data: {
            projectId,
            sequence: settings.nextSequence,
            length: proposal.length,
            pedagogy: proposal.pedagogy,
            technicalFamiliarity: proposal.technicalFamiliarity,
            tone: proposal.tone,
            guidance: proposal.guidance,
            confirmedByUserId: userId,
          },
        });
        await tx.editorialProfileProposal.update({
          where: { id: proposal.id },
          data: { status: 'confirmed', version: { increment: 1 } },
        });
        await tx.projectEditorialSettings.update({
          where: { projectId },
          data: {
            currentProfileRevisionId: profile.id,
            activeProposalId: null,
            nextSequence: { increment: 1 },
            version: { increment: 1 },
          },
        });
        return profile;
      },
      { isolationLevel: 'Serializable' },
    );
    const releaseId = await this.publication.queueEditorialProfile(profile);
    return { profileRevisionId: profile.id, releaseId };
  }
  async getProposal(userId: string, projectId: string, proposalId: string) {
    await this.access.requireContributor(userId, projectId);
    const proposal = await this.prisma.editorialProfileProposal.findFirst({
      where: { id: proposalId, projectId },
      include: { preview: true },
    });
    if (!proposal) throw new NotFoundException({ code: 'NOT_FOUND' });
    return this.proposalView(proposal);
  }
  private proposalView(proposal: {
    id: string;
    status: string;
    version: number;
    length: EditorialProfileValues['length'];
    pedagogy: EditorialProfileValues['pedagogy'];
    technicalFamiliarity: EditorialProfileValues['technicalFamiliarity'];
    tone: EditorialProfileValues['tone'];
    guidance: string | null;
    representativeCategoryReferenceId: string | null;
    preview?: { beforeContentJson: unknown; afterContentJson: unknown } | null;
  }) {
    return {
      id: proposal.id,
      status: proposal.status,
      version: proposal.version,
      values: {
        length: proposal.length,
        pedagogy: proposal.pedagogy,
        technicalFamiliarity: proposal.technicalFamiliarity,
        tone: proposal.tone,
        guidance: proposal.guidance,
      },
      before: proposal.preview?.beforeContentJson ?? null,
      after: proposal.preview?.afterContentJson ?? null,
      hasRepresentativeContent: Boolean(
        proposal.representativeCategoryReferenceId,
      ),
      releaseProgress: null,
    };
  }
}
