import { asPrismaService, createPrismaMock } from '../../test/prisma-mock';
import { GenerationService } from '../../generation/generation.service';
import { ProjectAccessService } from '../../projects/project-access.service';
import { ClientPublicationService } from '../publication/client-publication.service';
import { EditorialProfileService } from './editorial-profile.service';
const values = {
  length: 'concise' as const,
  pedagogy: 'guided' as const,
  technicalFamiliarity: 'novice' as const,
  tone: 'reassuring' as const,
  guidance: null,
};
describe('EditorialProfileService', () => {
  function setup() {
    const prisma = createPrismaMock();
    const access = { requireContributor: jest.fn() };
    const generation = {
      createInTransaction: jest.fn().mockResolvedValue({ id: 'operation' }),
    };
    const publication = {
      queueEditorialProfile: jest.fn().mockResolvedValue('release'),
    };
    return {
      prisma,
      generation,
      publication,
      service: new EditorialProfileService(
        asPrismaService(prisma),
        access as unknown as ProjectAccessService,
        generation as unknown as GenerationService,
        publication as unknown as ClientPublicationService,
      ),
    };
  }
  it('returns defaults before configuration and a safe active preview later', async () => {
    const { prisma, service } = setup();
    prisma.projectEditorialSettings.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        version: 3,
        currentProfileRevision: { id: 'profile', sequence: 2, ...values },
        activeProposal: {
          id: 'proposal',
          version: 2,
          status: 'preview_ready',
          ...values,
          representativeCategoryReferenceId: 'reference',
          preview: {
            beforeContentJson: { categoryKey: 'overview', blocks: [] },
            afterContentJson: { categoryKey: 'overview', blocks: [] },
          },
        },
      });
    await expect(service.get('user', 'project')).resolves.toMatchObject({
      revisionId: null,
      length: 'balanced',
      version: 1,
    });
    await expect(service.get('user', 'project')).resolves.toMatchObject({
      revisionId: 'profile',
      proposal: { status: 'preview_ready', hasRepresentativeContent: true },
    });
  });
  it('saves without fabricated preview when there is no representative content', async () => {
    const { prisma, service, generation } = setup();
    prisma.projectEditorialSettings.upsert.mockResolvedValue({
      projectId: 'project',
      version: 1,
      currentProfileRevisionId: null,
      activeProposalId: null,
    });
    prisma.documentationCategoryReference.findFirst.mockResolvedValue(null);
    prisma.editorialProfileProposal.create.mockResolvedValue({
      id: 'proposal',
      projectId: 'project',
      version: 1,
      status: 'saved_without_preview',
      representativeCategoryReferenceId: null,
      ...values,
    });
    await expect(
      service.propose('user', 'project', 1, values),
    ).resolves.toMatchObject({
      status: 'saved_without_preview',
      before: null,
      after: null,
    });
    expect(generation.createInTransaction).not.toHaveBeenCalled();
  });
  it('replaces an active proposal and queues a real preview', async () => {
    const { prisma, service, generation } = setup();
    prisma.projectEditorialSettings.upsert.mockResolvedValue({
      projectId: 'project',
      version: 2,
      currentProfileRevisionId: 'base',
      activeProposalId: 'old',
    });
    prisma.documentationCategoryReference.findFirst.mockResolvedValue({
      id: 'reference',
    });
    prisma.editorialProfileProposal.create.mockResolvedValue({
      id: 'proposal',
      projectId: 'project',
      version: 1,
      status: 'preview_pending',
      representativeCategoryReferenceId: 'reference',
      ...values,
    });
    await expect(
      service.propose('user', 'project', 2, values),
    ).resolves.toMatchObject({ status: 'preview_pending' });
    expect(prisma.editorialProfileProposal.updateMany).toHaveBeenCalled();
    expect(generation.createInTransaction).toHaveBeenCalled();
    expect(prisma.editorialPreview.create).toHaveBeenCalled();
  });
  it('cancels safely and rejects stale cancellation', async () => {
    const { prisma, service } = setup();
    prisma.editorialProfileProposal.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    await expect(
      service.cancel('user', 'project', 'proposal', 1),
    ).resolves.toEqual({ cancelled: true });
    await expect(
      service.cancel('user', 'project', 'proposal', 1),
    ).rejects.toMatchObject({ response: { code: 'STALE_EDITORIAL_PROPOSAL' } });
  });
  it('confirms an immutable profile and queues the all-category release', async () => {
    const { prisma, publication, service } = setup();
    prisma.editorialProfileProposal.findFirst.mockResolvedValue({
      id: 'proposal',
      projectId: 'project',
      status: 'preview_ready',
      ...values,
    });
    prisma.projectEditorialSettings.findUnique.mockResolvedValue({
      projectId: 'project',
      activeProposalId: 'proposal',
      nextSequence: 4,
    });
    prisma.editorialProfileRevision.create.mockResolvedValue({
      id: 'profile',
      projectId: 'project',
      sequence: 4,
      ...values,
    });
    await expect(
      service.confirm('user', 'project', 'proposal', 1),
    ).resolves.toEqual({ profileRevisionId: 'profile', releaseId: 'release' });
    expect(publication.queueEditorialProfile).toHaveBeenCalled();
  });
  it('reads proposals and hides missing or unauthorized ids', async () => {
    const { prisma, service } = setup();
    prisma.editorialProfileProposal.findFirst
      .mockResolvedValueOnce({
        id: 'proposal',
        status: 'preview_pending',
        version: 1,
        representativeCategoryReferenceId: null,
        preview: null,
        ...values,
      })
      .mockResolvedValueOnce(null);
    await expect(
      service.getProposal('user', 'project', 'proposal'),
    ).resolves.toMatchObject({ id: 'proposal' });
    await expect(
      service.getProposal('user', 'project', 'missing'),
    ).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
  });
  it('rejects stale settings versions', async () => {
    const { prisma, service } = setup();
    prisma.projectEditorialSettings.upsert.mockResolvedValue({ version: 2 });
    await expect(
      service.propose('user', 'project', 1, values),
    ).rejects.toMatchObject({ response: { code: 'STALE_EDITORIAL_PROFILE' } });
  });
});
