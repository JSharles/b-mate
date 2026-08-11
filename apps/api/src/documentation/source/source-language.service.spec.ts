import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { GenerationService } from '../../generation/generation.service';
import { ProjectAccessService } from '../../projects/project-access.service';
import {
  asPrismaService,
  createPrismaMock,
  PrismaMock,
} from '../../test/prisma-mock';
import { SourceLanguageService } from './source-language.service';
import { SourceRevisionService } from './source-revision.service';

const userId = '00000000-0000-4000-8000-000000000001';
const projectId = '00000000-0000-4000-8000-000000000002';
const revisionId = '00000000-0000-4000-8000-000000000003';
const proposalId = '00000000-0000-4000-8000-000000000004';

describe('SourceLanguageService', () => {
  let prisma: PrismaMock;
  let access: jest.Mocked<Pick<ProjectAccessService, 'requireContributor'>>;
  let generation: jest.Mocked<Pick<GenerationService, 'createInTransaction'>>;
  let service: SourceLanguageService;

  beforeEach(() => {
    prisma = createPrismaMock();
    access = { requireContributor: jest.fn().mockResolvedValue({}) };
    generation = { createInTransaction: jest.fn() };
    service = new SourceLanguageService(
      asPrismaService(prisma),
      access as unknown as ProjectAccessService,
      generation as unknown as GenerationService,
    );
    prisma.projectSource.findUnique.mockResolvedValue({
      id: 'source-1',
      projectId,
      workingLanguage: 'en',
      currentRevisionId: revisionId,
    });
    prisma.sourceRevisionItem.count.mockResolvedValue(6);
  });

  it('returns a modifiable confirmation proposal before changing language', async () => {
    prisma.sourceLanguageProposal.create.mockResolvedValue({
      id: proposalId,
      fromLanguage: 'en',
      toLanguage: 'fr',
      expectedSourceRevisionId: revisionId,
      impactedItemCount: 6,
      version: 1,
    });

    await expect(
      service.propose(userId, projectId, {
        expectedSourceRevisionId: revisionId,
        language: 'fr',
      }),
    ).resolves.toEqual({
      id: proposalId,
      fromLanguage: 'en',
      toLanguage: 'fr',
      expectedSourceRevisionId: revisionId,
      impactedItemCount: 6,
      version: 1,
    });
    expect(prisma.projectSource.update).not.toHaveBeenCalled();
  });

  it('confirms explicitly by queueing a durable translation revision', async () => {
    prisma.sourceLanguageProposal.findFirst.mockResolvedValue({
      id: proposalId,
      projectSourceId: 'source-1',
      fromLanguage: 'en',
      toLanguage: 'fr',
      expectedSourceRevisionId: revisionId,
      version: 1,
      confirmedAt: null,
    });
    prisma.sourceLanguageProposal.updateMany.mockResolvedValue({ count: 1 });
    generation.createInTransaction.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000005',
      status: 'queued',
    } as never);

    await expect(
      service.confirm(userId, projectId, proposalId, { confirmed: true }),
    ).resolves.toEqual({
      operationId: '00000000-0000-4000-8000-000000000005',
      status: 'queued',
    });
    expect(generation.createInTransaction).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        projectId,
        type: 'source_consolidation',
        baseSourceRevisionId: revisionId,
        sourceLanguageProposalId: proposalId,
      }),
    );
    expect(prisma.projectSource.update).not.toHaveBeenCalled();
  });

  it.each(['running', 'waiting_provider', 'retry_scheduled'] as const)(
    'accepts the active %s operation state',
    async (status) => {
      prisma.sourceLanguageProposal.findFirst.mockResolvedValue({
        id: proposalId,
        projectSourceId: 'source-1',
        fromLanguage: 'en',
        toLanguage: 'fr',
        expectedSourceRevisionId: revisionId,
        version: 1,
        confirmedAt: null,
      });
      prisma.sourceLanguageProposal.updateMany.mockResolvedValue({ count: 1 });
      generation.createInTransaction.mockResolvedValue({
        id: 'operation',
        status,
      } as never);
      await expect(
        service.confirm(userId, projectId, proposalId, { confirmed: true }),
      ).resolves.toEqual({ operationId: 'operation', status });
    },
  );

  it('rejects an already-confirmed proposal', async () => {
    prisma.sourceLanguageProposal.findFirst.mockResolvedValue({
      id: proposalId,
      projectSourceId: 'source-1',
      fromLanguage: 'en',
      toLanguage: 'fr',
      expectedSourceRevisionId: revisionId,
      version: 2,
      confirmedAt: new Date(),
    });
    await expect(
      service.confirm(userId, projectId, proposalId, { confirmed: true }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects stale confirmation without changing language or queueing work', async () => {
    prisma.sourceLanguageProposal.findFirst.mockResolvedValue({
      id: proposalId,
      projectSourceId: 'source-1',
      fromLanguage: 'en',
      toLanguage: 'fr',
      expectedSourceRevisionId: '00000000-0000-4000-8000-000000000099',
      version: 1,
      confirmedAt: null,
    });

    await expect(
      service.confirm(userId, projectId, proposalId, { confirmed: true }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(generation.createInTransaction).not.toHaveBeenCalled();
    expect(prisma.projectSource.update).not.toHaveBeenCalled();
  });

  it('rejects missing, stale, and unchanged language proposals', async () => {
    prisma.projectSource.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.propose(userId, projectId, {
        expectedSourceRevisionId: revisionId,
        language: 'fr',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.projectSource.findUnique.mockResolvedValueOnce({
      id: 'source-1',
      workingLanguage: 'en',
      currentRevisionId: revisionId,
    });
    await expect(
      service.propose(userId, projectId, {
        expectedSourceRevisionId: 'different-revision',
        language: 'fr',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    prisma.projectSource.findUnique.mockResolvedValueOnce({
      id: 'source-1',
      workingLanguage: 'en',
      currentRevisionId: revisionId,
    });
    await expect(
      service.propose(userId, projectId, {
        expectedSourceRevisionId: revisionId,
        language: 'en',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('proposes a first language before any source revision exists', async () => {
    prisma.projectSource.findUnique.mockResolvedValue({
      id: 'source-1',
      workingLanguage: 'en',
      currentRevisionId: null,
    });
    prisma.sourceLanguageProposal.create.mockResolvedValue({
      id: proposalId,
      fromLanguage: 'en',
      toLanguage: 'fr',
      expectedSourceRevisionId: null,
      impactedItemCount: 0,
      version: 1,
    });
    await expect(
      service.propose(userId, projectId, {
        expectedSourceRevisionId: null,
        language: 'fr',
      }),
    ).resolves.toMatchObject({ impactedItemCount: 0 });
    expect(prisma.sourceRevisionItem.count).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation and an existing current proposal', async () => {
    await expect(
      service.confirm(userId, projectId, proposalId, {
        confirmed: false,
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.projectSource.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.confirm(userId, projectId, proposalId, { confirmed: true }),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.projectSource.findUnique.mockResolvedValueOnce({
      id: 'source-1',
      workingLanguage: 'en',
      currentRevisionId: revisionId,
    });
    prisma.sourceLanguageProposal.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.confirm(userId, projectId, proposalId, { confirmed: true }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('fails closed when confirmation claiming or operation creation is no longer active', async () => {
    const proposal = {
      id: proposalId,
      projectSourceId: 'source-1',
      fromLanguage: 'en',
      toLanguage: 'fr',
      expectedSourceRevisionId: revisionId,
      version: 1,
      confirmedAt: null,
    };
    prisma.sourceLanguageProposal.findFirst.mockResolvedValue(proposal);
    prisma.sourceLanguageProposal.updateMany.mockResolvedValueOnce({
      count: 0,
    });
    await expect(
      service.confirm(userId, projectId, proposalId, { confirmed: true }),
    ).rejects.toBeInstanceOf(ConflictException);

    prisma.sourceLanguageProposal.updateMany.mockResolvedValueOnce({
      count: 1,
    });
    generation.createInTransaction.mockResolvedValueOnce({
      id: 'operation',
      status: 'completed',
    } as never);
    await expect(
      service.confirm(userId, projectId, proposalId, { confirmed: true }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('commits translated content with stable item and provenance identities', async () => {
    const revisions = new SourceRevisionService(
      asPrismaService(prisma),
      access as unknown as ProjectAccessService,
    );
    prisma.projectSource.findUniqueOrThrow.mockResolvedValue({
      id: 'source-1',
      currentRevisionId: revisionId,
      nextSequence: 2,
    });
    prisma.sourceRevisionItem.findMany.mockResolvedValue([
      {
        id: 'old-revision-item-1',
        informationItemId: '00000000-0000-4000-8000-000000000010',
        kind: 'fact',
        state: 'confirmed',
        content: 'The budget is approved.',
        sortOrder: 0,
        categories: [{ categoryKey: 'overview' }],
        provenanceLinks: [
          {
            documentObservationId: '00000000-0000-4000-8000-000000000011',
            contributorAssertionId: null,
            role: 'supports',
          },
        ],
      },
    ]);
    prisma.sourceRevision.create.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000012',
    });
    prisma.sourceRevisionItem.create.mockResolvedValue({
      id: 'new-revision-item-1',
    });
    prisma.projectSource.updateMany.mockResolvedValue({ count: 1 });

    await revisions.commitLanguageChange(prisma as never, {
      projectId,
      projectSourceId: 'source-1',
      expectedSourceRevisionId: revisionId,
      toLanguage: 'fr',
      userId,
      translations: [
        {
          informationItemId: '00000000-0000-4000-8000-000000000010',
          translatedContent: 'Le budget est approuvé.',
        },
      ],
    });

    expect(prisma.sourceRevisionItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        informationItemId: '00000000-0000-4000-8000-000000000010',
        previousRevisionItemId: 'old-revision-item-1',
        content: 'Le budget est approuvé.',
        provenanceLinks: {
          create: [
            {
              documentObservationId: '00000000-0000-4000-8000-000000000011',
              contributorAssertionId: null,
              role: 'supports',
            },
          ],
        },
      }),
    });
    expect(prisma.projectSource.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ workingLanguage: 'fr' }),
      }),
    );
  });
});
