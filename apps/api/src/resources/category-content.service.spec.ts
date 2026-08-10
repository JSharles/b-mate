import { NotFoundException } from '@nestjs/common';
import {
  asPrismaService,
  createPrismaMock,
  PrismaMock,
} from '../test/prisma-mock';
import { CategoryContentService } from './category-content.service';
import { ReferenceAnalysisClient } from './reference-analysis.client';

const membership = {
  id: 'member-1',
  projectId: 'project-1',
  userId: 'user-1',
  role: 'client',
  isAdmin: false,
  createdAt: new Date(),
};

function content(categoryKey: string, en: string, fr: string) {
  return {
    id: `content-${categoryKey}`,
    projectId: 'project-1',
    categoryKey,
    contentEn: en,
    contentFr: fr,
    updatedAt: new Date(),
  };
}

describe('CategoryContentService', () => {
  let prisma: PrismaMock;
  let analysis: jest.Mocked<Pick<ReferenceAnalysisClient, 'submitDerivation'>>;
  let service: CategoryContentService;

  beforeEach(() => {
    prisma = createPrismaMock();
    analysis = { submitDerivation: jest.fn() };
    service = new CategoryContentService(
      asPrismaService(prisma),
      analysis as unknown as ReferenceAnalysisClient,
    );
    prisma.projectMember.findUnique.mockResolvedValue(membership);
    prisma.categoryContent.findMany.mockResolvedValue([]);
  });

  describe('findForProject', () => {
    it('resolves the caller locale server-side', async () => {
      prisma.categoryContent.findMany.mockResolvedValue([
        content('overview', 'What this delivers.', 'Ce que ça livre.'),
      ]);

      await expect(
        service.findForProject('user-1', 'project-1', 'fr'),
      ).resolves.toEqual([
        { categoryKey: 'overview', content: 'Ce que ça livre.' },
      ]);
      await expect(
        service.findForProject('user-1', 'project-1', 'en'),
      ).resolves.toEqual([
        { categoryKey: 'overview', content: 'What this delivers.' },
      ]);
    });

    // FR-022: the frozen list is the order, not whatever the database returned
    // — tabs must never reshuffle as content accumulates, and `other` is last.
    it('returns categories in the frozen order regardless of row order', async () => {
      prisma.categoryContent.findMany.mockResolvedValue([
        content('other', 'Leftovers.', 'Le reste.'),
        content('planning', 'March.', 'Mars.'),
        content('overview', 'Purpose.', 'Objet.'),
      ]);

      const result = await service.findForProject('user-1', 'project-1', 'en');

      expect(result.map((entry) => entry.categoryKey)).toEqual([
        'overview',
        'planning',
        'other',
      ]);
    });

    // FR-012: a category with nothing to say is *absent*, not present-and-empty
    // — that absence is the only mechanism producing "no empty tab".
    it('omits a category that has no content rather than returning it empty', async () => {
      prisma.categoryContent.findMany.mockResolvedValue([
        content('overview', 'Purpose.', 'Objet.'),
      ]);

      const result = await service.findForProject('user-1', 'project-1', 'en');

      expect(result).toHaveLength(1);
      expect(result.map((entry) => entry.categoryKey)).not.toContain(
        'how_it_works',
      );
    });

    it('returns nothing at all for a project with no derived content yet', async () => {
      await expect(
        service.findForProject('user-1', 'project-1', 'fr'),
      ).resolves.toEqual([]);
    });

    // Security by default: a non-member gets the same 404 as a missing project,
    // so the endpoint never confirms that a project exists.
    it('throws not found for a non-member', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(
        service.findForProject('user-2', 'project-1', 'fr'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.categoryContent.findMany).not.toHaveBeenCalled();
    });
  });

  describe('deriveForCategory', () => {
    const reference = {
      id: 'reference-1',
      projectId: 'project-1',
      categoryKey: 'overview',
      content: 'The validated reference body.',
      derivationBatchId: null,
      updatedAt: new Date(),
    };

    // The heart of the two-layer design: the client version is always derived
    // from the *reference*, never from a previous client version. That is what
    // stops the drift a rewrite-of-a-rewrite produces.
    it('derives from the validated reference, never from the live client text', async () => {
      prisma.categoryReference.findUnique.mockResolvedValue(reference);
      prisma.categoryContent.findMany.mockResolvedValue([
        content(
          'overview',
          'The stale client text.',
          'Le texte client obsolète.',
        ),
      ]);
      analysis.submitDerivation.mockResolvedValue('batch-1');

      await service.deriveForCategory('project-1', 'overview');

      expect(analysis.submitDerivation).toHaveBeenCalledWith(
        'overview',
        'The validated reference body.',
      );
    });

    // Derivation is asynchronous like everything else here. Storing the batch
    // id is what lets the sweep find the result later; until it lands, the
    // client keeps reading the previous version.
    it('records the batch id on the reference so the sweep can collect it', async () => {
      prisma.categoryReference.findUnique.mockResolvedValue(reference);
      analysis.submitDerivation.mockResolvedValue('batch-1');

      await expect(
        service.deriveForCategory('project-1', 'overview'),
      ).resolves.toBe('batch-1');
      expect(prisma.categoryReference.update).toHaveBeenCalledWith({
        where: { id: 'reference-1' },
        data: { derivationBatchId: 'batch-1' },
      });
    });

    it('derives nothing for a category with no validated reference', async () => {
      prisma.categoryReference.findUnique.mockResolvedValue(null);

      await expect(
        service.deriveForCategory('project-1', 'planning'),
      ).resolves.toBeNull();
      expect(analysis.submitDerivation).not.toHaveBeenCalled();
      expect(prisma.categoryReference.update).not.toHaveBeenCalled();
    });
  });
});
