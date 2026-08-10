import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProjectMember } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CategoryContentService } from './category-content.service';
import {
  AnsweredQuestion,
  ReferenceAnalysisClient,
} from './reference-analysis.client';
import { ResourceCategoryKey } from './resource-categories';

// research.md Decision 4. A model that has missed the same correction three
// times will not get it on the fourth, and an uncapped loop is an uncapped
// bill. Counting per draft rather than per category is what makes this mean
// "three attempts at *this* correction" — accepting or discarding deletes the
// row and resets it.
const MAX_REGENERATION_ATTEMPTS = 3;

export interface ReferenceQuestionResponse {
  id: string;
  question: string;
}

export interface ReferenceDraftResponse {
  categoryKey: ResourceCategoryKey;
  status: 'generating' | 'pending_review' | 'awaiting_answers';
  content: string;
  trigger: 'document_added' | 'document_removed' | 'regeneration_requested';
  triggerDocumentTitle: string | null;
  attempt: number;
  questions: ReferenceQuestionResponse[];
  createdAt: string;
}

@Injectable()
export class CategoryReferenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly referenceAnalysisClient: ReferenceAnalysisClient,
    private readonly categoryContentService: CategoryContentService,
  ) {}

  // FR-014a: a queue of independent items, one per category, deliberately not
  // grouped by the document that triggered them. A document touching three
  // categories appears here three times and each is disposed of on its own.
  // Oldest first — this is worked through, not browsed.
  async listDrafts(
    userId: string,
    projectId: string,
  ): Promise<ReferenceDraftResponse[]> {
    await this.assertIsContributor(userId, projectId);

    const drafts = await this.prisma.categoryReferenceDraft.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      // FR-022: ranked by how much the answer would change what the client
      // reads, most consequential first. Answered ones are dropped below.
      include: { questions: { orderBy: { rank: 'asc' } } },
    });

    const triggerIds = drafts
      .map((draft) => draft.triggerResourceId)
      .filter((id): id is string => id !== null);
    const resources =
      triggerIds.length > 0
        ? await this.prisma.resource.findMany({
            where: { id: { in: triggerIds } },
            select: { id: true, title: true },
          })
        : [];
    const titleById = new Map(resources.map((r) => [r.id, r.title]));

    return drafts.map((draft) => ({
      categoryKey: draft.categoryKey,
      status: draft.status,
      content: draft.content,
      trigger: draft.trigger,
      // Null when the triggering document has since been deleted — which is
      // exactly the case for a `document_removed` draft.
      triggerDocumentTitle: draft.triggerResourceId
        ? (titleById.get(draft.triggerResourceId) ?? null)
        : null,
      attempt: draft.attempt,
      questions: draft.questions
        .filter((question) => question.answer === null)
        .map((question) => ({ id: question.id, question: question.question })),
      createdAt: draft.createdAt.toISOString(),
    }));
  }

  // FR-023. Answering is the only path that consumes questions; skipping needs
  // no endpoint at all, because accepting a draft with questions outstanding
  // already works — the open points stay marked in the text, which is what the
  // ingestion prompt writes them for.
  async answerQuestions(
    userId: string,
    projectId: string,
    categoryKey: ResourceCategoryKey,
    answers: { questionId: string; answer: string }[],
  ): Promise<void> {
    const draft = await this.findReviewableDraft(
      userId,
      projectId,
      categoryKey,
    );

    const questions = await this.prisma.referenceQuestion.findMany({
      where: {
        draftId: draft.id,
        id: { in: answers.map((entry) => entry.questionId) },
      },
    });
    if (questions.length === 0) {
      throw new NotFoundException('Question not found');
    }

    const answerById = new Map(
      answers.map((entry) => [entry.questionId, entry.answer]),
    );
    const answered = questions.map((question) => ({
      question: question.question,
      answer: answerById.get(question.id) as string,
    }));

    // Answers are recorded before the rebuild is submitted: if the rebuild
    // fails, the contributor's typing is not lost with it.
    for (const question of questions) {
      await this.prisma.referenceQuestion.update({
        where: { id: question.id },
        data: { answer: answerById.get(question.id) },
      });
    }

    // The same attempt count as a correction, and for the same reason — an
    // answer that keeps failing to land is the loop research.md Decision 4
    // exists to stop.
    await this.rebuild(
      projectId,
      categoryKey,
      draft.lastInstruction,
      draft.trigger,
      draft.attempt + 1,
      answered,
    );
  }

  // The only act that makes anything client-visible (FR-014, FR-019a).
  async accept(
    userId: string,
    projectId: string,
    categoryKey: ResourceCategoryKey,
  ): Promise<void> {
    const draft = await this.findReviewableDraft(
      userId,
      projectId,
      categoryKey,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.categoryReference.upsert({
        where: { projectId_categoryKey: { projectId, categoryKey } },
        create: { projectId, categoryKey, content: draft.content },
        update: { content: draft.content },
      });
      await tx.categoryReferenceDraft.delete({ where: { id: draft.id } });
    });

    // FR-014: this is the only gate. What a client reads follows from the
    // approval without a second queue.
    await this.categoryContentService.deriveForCategory(projectId, categoryKey);

    // Catch-up: a document ingested while this draft was waiting had its
    // extract stored but could not open a competing draft (the sweep
    // serialises on the unique constraint). Its material is not in what we
    // just promoted, so the category is rebuilt now that the queue is clear.
    const newerExtract = await this.prisma.categoryExtract.findFirst({
      where: {
        categoryKey,
        createdAt: { gt: draft.createdAt },
        resource: { projectId },
      },
    });
    if (newerExtract) {
      await this.rebuild(projectId, categoryKey, null, 'document_added');
    }
  }

  async discard(
    userId: string,
    projectId: string,
    categoryKey: ResourceCategoryKey,
  ): Promise<void> {
    const draft = await this.findReviewableDraft(
      userId,
      projectId,
      categoryKey,
    );

    // FR-018: the previously validated content and everything derived from it
    // are untouched. Deleting the draft is the whole operation.
    await this.prisma.categoryReferenceDraft.delete({
      where: { id: draft.id },
    });
  }

  // FR-015/FR-016. The contributor instructs; they never rewrite the text
  // themselves.
  async regenerate(
    userId: string,
    projectId: string,
    categoryKey: ResourceCategoryKey,
    instruction: string,
  ): Promise<void> {
    const draft = await this.findReviewableDraft(
      userId,
      projectId,
      categoryKey,
    );

    if (draft.attempt >= MAX_REGENERATION_ATTEMPTS) {
      throw new ConflictException(
        'This has been regenerated three times without converging. Accept it as it stands, or discard it.',
      );
    }

    await this.rebuild(
      projectId,
      categoryKey,
      instruction,
      'regeneration_requested',
      draft.attempt + 1,
    );
  }

  // Shared by regeneration and, from US4, by deletion — both are the same
  // operation underneath: re-merge the extracts that currently exist for this
  // category. A category with no extract left has nothing to rebuild, so its
  // content is removed outright (FR-020).
  async rebuild(
    projectId: string,
    categoryKey: ResourceCategoryKey,
    instruction: string | null,
    trigger: 'document_added' | 'document_removed' | 'regeneration_requested',
    attempt = 1,
    answers: AnsweredQuestion[] = [],
  ): Promise<void> {
    const extracts = await this.prisma.categoryExtract.findMany({
      where: { categoryKey, resource: { projectId } },
      orderBy: { createdAt: 'asc' },
    });

    if (extracts.length === 0) {
      await this.prisma.$transaction(async (tx) => {
        await tx.categoryReferenceDraft.deleteMany({
          where: { projectId, categoryKey },
        });
        await tx.categoryContent.deleteMany({
          where: { projectId, categoryKey },
        });
        await tx.categoryReference.deleteMany({
          where: { projectId, categoryKey },
        });
      });
      return;
    }

    const batchId = await this.referenceAnalysisClient.submitRebuild(
      categoryKey,
      extracts.map((extract) => extract.content),
      instruction,
      answers,
    );

    await this.prisma.categoryReferenceDraft.upsert({
      where: { projectId_categoryKey: { projectId, categoryKey } },
      create: {
        projectId,
        categoryKey,
        content: '',
        status: 'generating',
        trigger,
        attempt,
        lastInstruction: instruction,
        anthropicBatchId: batchId,
      },
      update: {
        status: 'generating',
        trigger,
        attempt,
        lastInstruction: instruction,
        anthropicBatchId: batchId,
      },
    });
  }

  // Collapses "no draft", "wrong project" and "not a contributor" into one
  // indistinguishable response — never confirms existence to someone who
  // should not know (Constitution V).
  private async findReviewableDraft(
    userId: string,
    projectId: string,
    categoryKey: ResourceCategoryKey,
  ) {
    await this.assertIsContributor(userId, projectId);

    const draft = await this.prisma.categoryReferenceDraft.findUnique({
      where: { projectId_categoryKey: { projectId, categoryKey } },
    });
    if (!draft || draft.status === 'generating') {
      throw new NotFoundException('No draft awaiting review for this category');
    }

    return draft;
  }

  private async assertIsContributor(
    userId: string,
    projectId: string,
  ): Promise<ProjectMember> {
    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });

    if (!membership || membership.role !== 'contributor') {
      throw new NotFoundException('Project not found');
    }

    return membership;
  }
}
