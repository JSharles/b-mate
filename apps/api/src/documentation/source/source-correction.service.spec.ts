import { ConflictException, NotFoundException } from '@nestjs/common';
import { ProjectAccessService } from '../../projects/project-access.service';
import {
  asPrismaService,
  createPrismaMock,
  PrismaMock,
} from '../../test/prisma-mock';
import { SourceCorrectionService } from './source-correction.service';
import { SourceRevisionService } from './source-revision.service';

const userId = '00000000-0000-4000-8000-000000000001';
const projectId = '00000000-0000-4000-8000-000000000002';
const itemId = '00000000-0000-4000-8000-000000000003';
const revisionId = '00000000-0000-4000-8000-000000000004';

describe('SourceCorrectionService', () => {
  let prisma: PrismaMock;
  let access: jest.Mocked<Pick<ProjectAccessService, 'requireContributor'>>;
  let revisions: jest.Mocked<
    Pick<SourceRevisionService, 'commitGuidedCorrection'>
  >;
  let service: SourceCorrectionService;

  beforeEach(() => {
    prisma = createPrismaMock();
    access = { requireContributor: jest.fn().mockResolvedValue({}) };
    revisions = {
      commitGuidedCorrection: jest.fn().mockResolvedValue({
        status: 'committed',
        revisionId: '00000000-0000-4000-8000-000000000005',
      }),
    };
    service = new SourceCorrectionService(
      asPrismaService(prisma),
      access as unknown as ProjectAccessService,
      revisions as unknown as SourceRevisionService,
    );
    prisma.projectSource.findUnique.mockResolvedValue({
      id: 'source-1',
      projectId,
      currentRevisionId: revisionId,
    });
    prisma.sourceRevisionItem.findFirst.mockResolvedValue({
      informationItemId: itemId,
    });
  });

  it('creates an immutable attributable assertion and a new revision', async () => {
    prisma.contributorAssertion.create.mockResolvedValue({ id: 'assertion-1' });

    await expect(
      service.correct(userId, projectId, itemId, {
        expectedSourceRevisionId: revisionId,
        correctedContent: 'Le budget validé est de 12 000 €.',
        reason: 'Avenant signé.',
      }),
    ).resolves.toEqual({
      status: 'completed',
      revisionId: '00000000-0000-4000-8000-000000000005',
    });

    expect(prisma.contributorAssertion.create).toHaveBeenCalledWith({
      data: {
        projectSourceId: 'source-1',
        authorUserId: userId,
        kind: 'guided_correction',
        targetInformationItemId: itemId,
        content: 'Le budget validé est de 12 000 €.',
        reason: 'Avenant signé.',
      },
    });
    expect(revisions.commitGuidedCorrection).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        assertionId: 'assertion-1',
        informationItemId: itemId,
        expectedSourceRevisionId: revisionId,
      }),
    );
  });

  it('rejects stale source tokens before creating an assertion', async () => {
    await expect(
      service.correct(userId, projectId, itemId, {
        expectedSourceRevisionId: '00000000-0000-4000-8000-000000000099',
        correctedContent: 'Correction',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.contributorAssertion.create).not.toHaveBeenCalled();
  });

  it('returns the same hidden 404 for an item outside the current source', async () => {
    prisma.sourceRevisionItem.findFirst.mockResolvedValue(null);

    await expect(
      service.correct(userId, projectId, itemId, {
        expectedSourceRevisionId: revisionId,
        correctedContent: 'Correction',
      }),
    ).rejects.toEqual(new NotFoundException({ code: 'NOT_FOUND' }));
  });

  it('hides a project without a canonical source', async () => {
    prisma.projectSource.findUnique.mockResolvedValue(null);
    await expect(
      service.correct(userId, projectId, itemId, {
        expectedSourceRevisionId: revisionId,
        correctedContent: 'Correction',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('omits a blank optional reason and rejects a concurrent revision change', async () => {
    prisma.contributorAssertion.create.mockResolvedValue({ id: 'assertion-1' });
    revisions.commitGuidedCorrection.mockResolvedValue({
      status: 'stale',
      currentRevisionId: 'newer-revision',
    });
    await expect(
      service.correct(userId, projectId, itemId, {
        expectedSourceRevisionId: revisionId,
        correctedContent: '  Corrected fact  ',
        reason: '   ',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.contributorAssertion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        content: 'Corrected fact',
        reason: undefined,
      }),
    });
  });
});
