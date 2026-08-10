import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  asPrismaService,
  createPrismaMock,
  PrismaMock,
} from '../test/prisma-mock';
import { CategoryContentService } from './category-content.service';
import { CategoryReferenceService } from './category-reference.service';
import { ReferenceAnalysisClient } from './reference-analysis.client';

const contributor = {
  id: 'member-1',
  projectId: 'project-1',
  userId: 'user-1',
  role: 'contributor',
  isAdmin: true,
  createdAt: new Date(),
};
const client = { ...contributor, role: 'client', isAdmin: false };

const pendingDraft = {
  id: 'draft-1',
  projectId: 'project-1',
  categoryKey: 'overview',
  status: 'pending_review',
  content: 'The reviewed reference body.',
  trigger: 'document_added',
  triggerResourceId: 'resource-1',
  attempt: 1,
  lastInstruction: null,
  anthropicBatchId: null,
  questions: [],
  createdAt: new Date('2026-08-10T10:00:00.000Z'),
};

describe('CategoryReferenceService', () => {
  let prisma: PrismaMock;
  let analysis: jest.Mocked<Pick<ReferenceAnalysisClient, 'submitRebuild'>>;
  let categoryContent: jest.Mocked<
    Pick<CategoryContentService, 'deriveForCategory'>
  >;
  let service: CategoryReferenceService;

  beforeEach(() => {
    prisma = createPrismaMock();
    prisma.categoryExtract.findMany.mockResolvedValue([
      { content: 'Extract A' },
    ]);
    prisma.categoryExtract.findFirst.mockResolvedValue(null);
    analysis = { submitRebuild: jest.fn().mockResolvedValue('batch_rebuild') };
    categoryContent = { deriveForCategory: jest.fn().mockResolvedValue(null) };
    service = new CategoryReferenceService(
      asPrismaService(prisma),
      analysis as unknown as ReferenceAnalysisClient,
      categoryContent as unknown as CategoryContentService,
    );
  });

  describe('listDrafts', () => {
    it('returns the queue oldest first, with the document that triggered each draft', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributor);
      prisma.categoryReferenceDraft.findMany.mockResolvedValue([pendingDraft]);
      prisma.resource.findMany.mockResolvedValue([
        { id: 'resource-1', title: 'Client brief' },
      ]);

      const drafts = await service.listDrafts('user-1', 'project-1');

      expect(prisma.categoryReferenceDraft.findMany).toHaveBeenCalledWith({
        where: { projectId: 'project-1' },
        orderBy: { createdAt: 'asc' },
        include: { questions: { orderBy: { rank: 'asc' } } },
      });
      expect(drafts).toEqual([
        expect.objectContaining({
          categoryKey: 'overview',
          triggerDocumentTitle: 'Client brief',
          attempt: 1,
        }),
      ]);
    });

    // A `document_removed` draft has no document left to name.
    it('reports a null document title when the trigger no longer exists', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributor);
      prisma.categoryReferenceDraft.findMany.mockResolvedValue([
        {
          ...pendingDraft,
          trigger: 'document_removed',
          triggerResourceId: null,
        },
      ]);

      const [draft] = await service.listDrafts('user-1', 'project-1');

      expect(draft.triggerDocumentTitle).toBeNull();
      expect(prisma.resource.findMany).not.toHaveBeenCalled();
    });

    it('throws not found for a client-role member', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(client);

      await expect(service.listDrafts('user-1', 'project-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('accept', () => {
    it('promotes the draft to live reference content and removes the draft', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributor);
      prisma.categoryReferenceDraft.findUnique.mockResolvedValue(pendingDraft);

      await service.accept('user-1', 'project-1', 'overview');

      expect(prisma.categoryReference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            projectId_categoryKey: {
              projectId: 'project-1',
              categoryKey: 'overview',
            },
          },
          create: expect.objectContaining({
            content: 'The reviewed reference body.',
          }) as unknown,
        }),
      );
      expect(prisma.categoryReferenceDraft.delete).toHaveBeenCalledWith({
        where: { id: 'draft-1' },
      });
    });

    // FR-014: approving is the only gate — what the client reads follows from
    // it, without a second review queue.
    it('derives the client-facing version once the reference is approved', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributor);
      prisma.categoryReferenceDraft.findUnique.mockResolvedValue(pendingDraft);

      await service.accept('user-1', 'project-1', 'overview');

      expect(categoryContent.deriveForCategory).toHaveBeenCalledWith(
        'project-1',
        'overview',
      );
    });

    it('derives nothing when a draft is discarded', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributor);
      prisma.categoryReferenceDraft.findUnique.mockResolvedValue(pendingDraft);

      await service.discard('user-1', 'project-1', 'overview');

      expect(categoryContent.deriveForCategory).not.toHaveBeenCalled();
    });

    // The sweep serialises: a document ingested while this draft waited had
    // its extract stored but could not open a competing draft. Its material is
    // not in what we just promoted, so the category must catch up.
    it('rebuilds the category when a document was ingested while the draft waited', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributor);
      prisma.categoryReferenceDraft.findUnique.mockResolvedValue(pendingDraft);
      prisma.categoryExtract.findFirst.mockResolvedValue({ id: 'extract-2' });

      await service.accept('user-1', 'project-1', 'overview');

      expect(analysis.submitRebuild).toHaveBeenCalledWith(
        'overview',
        ['Extract A'],
        null,
        [],
      );
    });

    it('does not rebuild when nothing arrived while the draft waited', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributor);
      prisma.categoryReferenceDraft.findUnique.mockResolvedValue(pendingDraft);

      await service.accept('user-1', 'project-1', 'overview');

      expect(analysis.submitRebuild).not.toHaveBeenCalled();
    });

    it('throws not found when no draft awaits review', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributor);
      prisma.categoryReferenceDraft.findUnique.mockResolvedValue(null);

      await expect(
        service.accept('user-1', 'project-1', 'overview'),
      ).rejects.toThrow(NotFoundException);
    });

    // A draft still being generated is not something a contributor can act on.
    it('throws not found while a rebuild is still in flight', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributor);
      prisma.categoryReferenceDraft.findUnique.mockResolvedValue({
        ...pendingDraft,
        status: 'generating',
      });

      await expect(
        service.accept('user-1', 'project-1', 'overview'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('discard', () => {
    // FR-018: deleting the draft is the whole operation.
    it('removes the draft and touches nothing else', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributor);
      prisma.categoryReferenceDraft.findUnique.mockResolvedValue(pendingDraft);

      await service.discard('user-1', 'project-1', 'overview');

      expect(prisma.categoryReferenceDraft.delete).toHaveBeenCalledWith({
        where: { id: 'draft-1' },
      });
      expect(prisma.categoryReference.upsert).not.toHaveBeenCalled();
      expect(prisma.categoryContent.deleteMany).not.toHaveBeenCalled();
      expect(analysis.submitRebuild).not.toHaveBeenCalled();
    });
  });

  describe('regenerate', () => {
    it('submits a rebuild carrying the instruction and marks the draft as generating', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributor);
      prisma.categoryReferenceDraft.findUnique.mockResolvedValue(pendingDraft);

      await service.regenerate(
        'user-1',
        'project-1',
        'overview',
        'The migration is March, not February.',
      );

      expect(analysis.submitRebuild).toHaveBeenCalledWith(
        'overview',
        ['Extract A'],
        'The migration is March, not February.',
        [],
      );
      expect(prisma.categoryReferenceDraft.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            status: 'generating',
            attempt: 2,
            lastInstruction: 'The migration is March, not February.',
            anthropicBatchId: 'batch_rebuild',
          }) as unknown,
        }),
      );
    });

    // research.md Decision 4: a model that has missed the same correction
    // three times will not get it on the fourth.
    it('refuses a fourth attempt and leaves accept-or-discard as the way out', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributor);
      prisma.categoryReferenceDraft.findUnique.mockResolvedValue({
        ...pendingDraft,
        attempt: 3,
      });

      await expect(
        service.regenerate('user-1', 'project-1', 'overview', 'again please'),
      ).rejects.toThrow(ConflictException);
      expect(analysis.submitRebuild).not.toHaveBeenCalled();
    });

    it('throws not found for a client-role member', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(client);

      await expect(
        service.regenerate('user-1', 'project-1', 'overview', 'change it'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('rebuild', () => {
    // FR-020: the last document feeding a category is gone, so the category
    // has nothing left to say and disappears from the client's view.
    it('removes the category outright when no extract survives', async () => {
      prisma.categoryExtract.findMany.mockResolvedValue([]);

      await service.rebuild('project-1', 'overview', null, 'document_removed');

      expect(analysis.submitRebuild).not.toHaveBeenCalled();
      expect(prisma.categoryReference.deleteMany).toHaveBeenCalledWith({
        where: { projectId: 'project-1', categoryKey: 'overview' },
      });
      expect(prisma.categoryContent.deleteMany).toHaveBeenCalledWith({
        where: { projectId: 'project-1', categoryKey: 'overview' },
      });
      expect(prisma.categoryReferenceDraft.deleteMany).toHaveBeenCalledWith({
        where: { projectId: 'project-1', categoryKey: 'overview' },
      });
    });

    it('rebuilds from every surviving extract, in order', async () => {
      prisma.categoryExtract.findMany.mockResolvedValue([
        { content: 'First' },
        { content: 'Second' },
      ]);

      await service.rebuild('project-1', 'planning', null, 'document_removed');

      expect(prisma.categoryExtract.findMany).toHaveBeenCalledWith({
        where: {
          categoryKey: 'planning',
          resource: { projectId: 'project-1' },
        },
        orderBy: { createdAt: 'asc' },
      });
      expect(analysis.submitRebuild).toHaveBeenCalledWith(
        'planning',
        ['First', 'Second'],
        null,
        [],
      );
    });

    // spec Edge Cases: a document deleted while its own draft still waits for
    // review. The draft describes a world that no longer exists, so it is
    // replaced rather than queued alongside — and the attempt counter starts
    // over, since this is a new question, not another try at the old one.
    it('replaces a draft still awaiting review rather than queueing a second one', async () => {
      prisma.categoryExtract.findMany.mockResolvedValue([{ content: 'First' }]);
      analysis.submitRebuild.mockResolvedValue('batch-9');

      await service.rebuild('project-1', 'planning', null, 'document_removed');

      expect(prisma.categoryReferenceDraft.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            projectId_categoryKey: {
              projectId: 'project-1',
              categoryKey: 'planning',
            },
          },
          update: expect.objectContaining({
            status: 'generating',
            trigger: 'document_removed',
            attempt: 1,
            anthropicBatchId: 'batch-9',
          }) as unknown,
        }),
      );
    });
  });

  // specs/015 US5.
  describe('questions', () => {
    const awaitingDraft = {
      ...pendingDraft,
      status: 'awaiting_answers',
      questions: [
        {
          id: 'question-1',
          question: 'Is the migration February or March?',
          answer: null,
          rank: 1,
        },
        {
          id: 'question-2',
          question: 'Which team owns the rollout?',
          answer: null,
          rank: 2,
        },
      ],
    };

    it('lists only the questions still outstanding, most consequential first', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributor);
      prisma.categoryReferenceDraft.findMany.mockResolvedValue([
        {
          ...awaitingDraft,
          questions: [
            { ...awaitingDraft.questions[0], answer: 'March.' },
            awaitingDraft.questions[1],
          ],
        },
      ]);
      prisma.resource.findMany.mockResolvedValue([
        { id: 'resource-1', title: 'Client brief' },
      ]);

      const [draft] = await service.listDrafts('user-1', 'project-1');

      expect(draft.questions).toEqual([
        { id: 'question-2', question: 'Which team owns the rollout?' },
      ]);
    });

    it('records the answers and rebuilds the category with them', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributor);
      prisma.categoryReferenceDraft.findUnique.mockResolvedValue(awaitingDraft);
      prisma.referenceQuestion.findMany.mockResolvedValue([
        awaitingDraft.questions[0],
      ]);

      await service.answerQuestions('user-1', 'project-1', 'overview', [
        { questionId: 'question-1', answer: 'March.' },
      ]);

      expect(prisma.referenceQuestion.update).toHaveBeenCalledWith({
        where: { id: 'question-1' },
        data: { answer: 'March.' },
      });
      expect(analysis.submitRebuild).toHaveBeenCalledWith(
        'overview',
        ['Extract A'],
        null,
        [
          {
            question: 'Is the migration February or March?',
            answer: 'March.',
          },
        ],
      );
    });

    // FR-023: answering one of three is a normal outcome — the other two stay
    // open and their markers stay in the text.
    it('accepts a partial answer without touching the questions left alone', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributor);
      prisma.categoryReferenceDraft.findUnique.mockResolvedValue(awaitingDraft);
      prisma.referenceQuestion.findMany.mockResolvedValue([
        awaitingDraft.questions[0],
      ]);

      await service.answerQuestions('user-1', 'project-1', 'overview', [
        { questionId: 'question-1', answer: 'March.' },
      ]);

      expect(prisma.referenceQuestion.update).toHaveBeenCalledTimes(1);
    });

    // The skip path needs no endpoint at all: accepting a draft with questions
    // outstanding already works, and that is the whole of FR-023.
    it('accepts a draft with questions still outstanding', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributor);
      prisma.categoryReferenceDraft.findUnique.mockResolvedValue(awaitingDraft);

      await expect(
        service.accept('user-1', 'project-1', 'overview'),
      ).resolves.toBeUndefined();
      expect(prisma.categoryReference.upsert).toHaveBeenCalled();
      expect(categoryContent.deriveForCategory).toHaveBeenCalled();
    });

    it('throws not found when none of the answered questions belong to the draft', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributor);
      prisma.categoryReferenceDraft.findUnique.mockResolvedValue(awaitingDraft);
      prisma.referenceQuestion.findMany.mockResolvedValue([]);

      await expect(
        service.answerQuestions('user-1', 'project-1', 'overview', [
          { questionId: 'question-from-another-project', answer: 'March.' },
        ]),
      ).rejects.toThrow(NotFoundException);
      expect(analysis.submitRebuild).not.toHaveBeenCalled();
    });

    it('throws not found for a client-role member', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(client);

      await expect(
        service.answerQuestions('user-1', 'project-1', 'overview', [
          { questionId: 'question-1', answer: 'March.' },
        ]),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
