import type { User } from '@prisma/client';
import { CategoriesController } from './categories.controller';
import { CategoryContentService } from './category-content.service';
import { CategoryReferenceService } from './category-reference.service';

const fakeUser = { id: 'user-1' } as User;

describe('CategoriesController', () => {
  let categoryReferenceService: jest.Mocked<
    Pick<
      CategoryReferenceService,
      'listDrafts' | 'accept' | 'discard' | 'regenerate' | 'answerQuestions'
    >
  >;
  let categoryContentService: jest.Mocked<
    Pick<CategoryContentService, 'findForProject'>
  >;
  let controller: CategoriesController;

  beforeEach(() => {
    categoryReferenceService = {
      listDrafts: jest.fn(),
      accept: jest.fn(),
      discard: jest.fn(),
      regenerate: jest.fn(),
      answerQuestions: jest.fn(),
    };
    categoryContentService = { findForProject: jest.fn() };
    controller = new CategoriesController(
      categoryReferenceService as unknown as CategoryReferenceService,
      categoryContentService as unknown as CategoryContentService,
    );
  });

  describe('listDrafts', () => {
    it('delegates to the service with the current user and project id', async () => {
      categoryReferenceService.listDrafts.mockResolvedValue([]);

      await controller.listDrafts(fakeUser, 'project-1');

      expect(categoryReferenceService.listDrafts).toHaveBeenCalledWith(
        'user-1',
        'project-1',
      );
    });
  });

  describe('findContent', () => {
    it('resolves the caller locale and delegates', async () => {
      categoryContentService.findForProject.mockResolvedValue([]);

      await controller.findContent(fakeUser, 'project-1', 'en');

      expect(categoryContentService.findForProject).toHaveBeenCalledWith(
        'user-1',
        'project-1',
        'en',
      );
    });

    it('falls back to the app default locale when none is given', async () => {
      categoryContentService.findForProject.mockResolvedValue([]);

      await controller.findContent(fakeUser, 'project-1', undefined);

      expect(categoryContentService.findForProject).toHaveBeenCalledWith(
        'user-1',
        'project-1',
        'fr',
      );
    });
  });

  describe('accept', () => {
    it('delegates with the category being accepted', async () => {
      categoryReferenceService.accept.mockResolvedValue(undefined);

      await controller.accept(fakeUser, 'project-1', 'overview');

      expect(categoryReferenceService.accept).toHaveBeenCalledWith(
        'user-1',
        'project-1',
        'overview',
      );
    });
  });

  describe('discard', () => {
    it('delegates with the category being discarded', async () => {
      categoryReferenceService.discard.mockResolvedValue(undefined);

      await controller.discard(fakeUser, 'project-1', 'planning');

      expect(categoryReferenceService.discard).toHaveBeenCalledWith(
        'user-1',
        'project-1',
        'planning',
      );
    });
  });

  describe('regenerate', () => {
    it('unwraps the instruction from the body and delegates', async () => {
      categoryReferenceService.regenerate.mockResolvedValue(undefined);

      await controller.regenerate(fakeUser, 'project-1', 'planning', {
        instruction: 'The migration is March, not February.',
      });

      expect(categoryReferenceService.regenerate).toHaveBeenCalledWith(
        'user-1',
        'project-1',
        'planning',
        'The migration is March, not February.',
      );
    });

    it('propagates the refusal once the attempt cap is reached', async () => {
      categoryReferenceService.regenerate.mockRejectedValue(
        new Error('This has been regenerated three times without converging.'),
      );

      await expect(
        controller.regenerate(fakeUser, 'project-1', 'planning', {
          instruction: 'again',
        }),
      ).rejects.toThrow('regenerated three times');
    });
  });

  // specs/015 FR-023. There is deliberately no skip counterpart: accepting a
  // draft with questions outstanding is the skip.
  describe('answerQuestions', () => {
    it('unwraps the answers from the body and delegates', async () => {
      categoryReferenceService.answerQuestions.mockResolvedValue(undefined);

      await controller.answerQuestions(fakeUser, 'project-1', 'planning', {
        answers: [{ questionId: 'question-1', answer: 'March.' }],
      });

      expect(categoryReferenceService.answerQuestions).toHaveBeenCalledWith(
        'user-1',
        'project-1',
        'planning',
        [{ questionId: 'question-1', answer: 'March.' }],
      );
    });
  });
});
