import { asPrismaService, createPrismaMock } from '../../test/prisma-mock';
import { ProjectAccessService } from '../../projects/project-access.service';
import { DocumentationWorkspaceService } from './documentation-workspace.service';
interface Case {
  failed: number;
  reviews: number;
  active: number;
  release: string | null;
  pending: {
    id: string;
    expectedSectionCount: number;
    entries: object[];
  } | null;
  documents?: number;
}

describe('DocumentationWorkspaceService', () => {
  it.each([
    [
      {
        failed: 1,
        reviews: 0,
        active: 0,
        release: null,
        pending: null,
      },
      'needs_attention',
      'nothing_published',
    ],
    [
      {
        failed: 0,
        reviews: 1,
        active: 0,
        release: 'release-1',
        pending: { id: 'pending', expectedSectionCount: 2, entries: [{}] },
      },
      'needs_action',
      'previous_version_visible',
    ],
    [
      { failed: 0, reviews: 0, active: 1, release: null, pending: null },
      'processing',
      'nothing_published',
    ],
    [
      { failed: 0, reviews: 0, active: 0, release: 'release-1', pending: null },
      'published',
      'current_version_visible',
    ],
    // Documents but nothing composed yet: its own situation, and the one a
    // project sits in for as long as its contributor has not created a
    // section. Told to "add a first document" here, they would be told to
    // repeat what they already did.
    [
      { failed: 0, reviews: 0, active: 0, release: null, pending: null },
      'no_sections',
      'nothing_published',
    ],
    [
      {
        failed: 0,
        reviews: 0,
        active: 0,
        release: null,
        pending: null,
        documents: 0,
      },
      'empty',
      'nothing_published',
    ],
  ])('maps aggregate state %#', async (input, priority, clientVisibility) => {
    const prisma = createPrismaMock();
    const access = { requireContributor: jest.fn() };
    prisma.projectSource.findUnique.mockResolvedValue({
      currentRevisionId: 'revision-1',
    });
    const documents = input.documents ?? 3;
    prisma.sourceDocument.count.mockResolvedValue(documents);
    prisma.generationOperation.count
      .mockResolvedValueOnce(input.active)
      .mockResolvedValueOnce(input.failed);
    prisma.clarification.count.mockResolvedValue(2);
    prisma.sectionProposal.count.mockResolvedValue(input.reviews);
    prisma.projectClientPublication.findUnique.mockResolvedValue({
      currentReleaseId: input.release,
    });
    prisma.clientContentRelease.findFirst.mockResolvedValue(input.pending);
    const service = new DocumentationWorkspaceService(
      asPrismaService(prisma),
      access as unknown as ProjectAccessService,
    );
    await expect(service.get('user', 'project')).resolves.toMatchObject({
      priority,
      clientVisibility,
      documentCount: documents,
      openClarificationCount: 2,
      refreshAfterMs: input.active || input.pending ? 5_000 : 30_000,
    });
    expect(access.requireContributor).toHaveBeenCalled();
  });
});
