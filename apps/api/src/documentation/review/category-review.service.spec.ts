import { asPrismaService, createPrismaMock } from '../../test/prisma-mock';
import { ProjectAccessService } from '../../projects/project-access.service';
import { ClientPublicationService } from '../publication/client-publication.service';
import { CategoryProjectionService } from './category-projection.service';
import { CategoryReviewService } from './category-review.service';
import { EditorialIntentService } from './editorial-intent.service';
describe('CategoryReviewService', () => {
  function setup() {
    const prisma = createPrismaMock();
    const access = { requireContributor: jest.fn() };
    const projections = {
      ensurePendingDrafts: jest.fn(),
      catchUp: jest.fn(),
      queue: jest.fn().mockResolvedValue('new-draft'),
    };
    const publication = {
      queueAcceptedReference: jest.fn().mockResolvedValue('release'),
    };
    const service = new CategoryReviewService(
      asPrismaService(prisma),
      access as unknown as ProjectAccessService,
      projections as unknown as CategoryProjectionService,
      publication as unknown as ClientPublicationService,
      new EditorialIntentService(),
    );
    return { prisma, projections, publication, service };
  }
  const draft = {
    id: 'draft',
    projectId: 'project',
    categoryKey: 'overview',
    sourceRevisionId: 'revision',
    status: 'pending_review',
    version: 2,
    structuredContent: [{ type: 'fact', text: 'Fact' }],
    provenanceSummary: [],
  };
  it('lists projections and reads safe draft detail', async () => {
    const { prisma, service, projections } = setup();
    prisma.categoryProjectionState.findMany.mockResolvedValue([]);
    prisma.documentationCategoryReferenceDraft.findFirst.mockResolvedValue(
      draft,
    );
    await expect(service.list('user', 'project')).resolves.toEqual([]);
    await expect(
      service.detail('user', 'project', 'draft'),
    ).resolves.toMatchObject({ blocks: draft.structuredContent });
    expect(projections.ensurePendingDrafts).toHaveBeenCalled();
  });
  it('accepts immutably, queues publication, then catches up', async () => {
    const { prisma, service, publication, projections } = setup();
    prisma.documentationCategoryReferenceDraft.findFirst.mockResolvedValue(
      draft,
    );
    prisma.documentationCategoryReference.create.mockResolvedValue({
      id: 'reference',
      projectId: 'project',
      categoryKey: 'overview',
      sourceRevisionId: 'revision',
    });
    await expect(
      service.accept('user', 'project', 'draft', 2),
    ).resolves.toEqual({ referenceId: 'reference', releaseId: 'release' });
    expect(publication.queueAcceptedReference).toHaveBeenCalled();
    expect(projections.catchUp).toHaveBeenCalled();
  });
  it('discards and catches up without changing the validated pointer', async () => {
    const { prisma, service, projections } = setup();
    prisma.documentationCategoryReferenceDraft.findFirst.mockResolvedValue(
      draft,
    );
    await expect(
      service.discard('user', 'project', 'draft', 2),
    ).resolves.toEqual({ discarded: true });
    expect(projections.catchUp).toHaveBeenCalledWith('project', 'overview');
  });
  it('routes style instructions and regenerates factual corrections on the same revision', async () => {
    const { prisma, service, projections } = setup();
    await expect(
      service.correct(
        'user',
        'project',
        'draft',
        2,
        'plus court et pédagogique',
      ),
    ).resolves.toMatchObject({ routingCode: 'EDITORIAL_INSTRUCTION_REQUIRED' });
    prisma.documentationCategoryReferenceDraft.findFirst.mockResolvedValue(
      draft,
    );
    await expect(
      service.correct(
        'user',
        'project',
        'draft',
        2,
        'La date est le 18 septembre',
      ),
    ).resolves.toMatchObject({ routingCode: 'FACTUAL_CORRECTION_QUEUED' });
    expect(projections.queue).toHaveBeenCalledWith(
      'project',
      'overview',
      'revision',
      'factual_correction',
      'draft',
    );
  });
  it('rejects stale review versions', async () => {
    const { prisma, service } = setup();
    prisma.documentationCategoryReferenceDraft.findFirst.mockResolvedValue(
      null,
    );
    await expect(
      service.accept('user', 'project', 'draft', 1),
    ).rejects.toMatchObject({ response: { code: 'STALE_REVIEW' } });
  });
});
