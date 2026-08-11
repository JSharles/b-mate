import type { User } from '@prisma/client';
import { CategoryReviewController } from './category-review.controller';
import { ClientContentController } from './client-content.controller';
import { DocumentationWorkspaceController } from './documentation-workspace.controller';
import { EditorialProfileController } from './editorial-profile.controller';
import { CategoryReviewService } from '../review/category-review.service';
import { ClientPublicationService } from '../publication/client-publication.service';
import { ProjectAccessService } from '../../projects/project-access.service';
import { DocumentationWorkspaceService } from '../workspace/documentation-workspace.service';
import { EditorialProfileService } from '../editorial/editorial-profile.service';
const user = { id: 'user' } as User;
describe('documentation controllers', () => {
  it('delegates factual review contracts with exact ids and versions', async () => {
    const service = {
      list: jest.fn(),
      detail: jest.fn(),
      accept: jest.fn(),
      discard: jest.fn(),
      correct: jest.fn(),
    };
    const c = new CategoryReviewController(
      service as unknown as CategoryReviewService,
    );
    await c.list(user, 'p');
    await c.detail(user, 'p', 'd');
    await c.accept(user, 'p', 'd', { expectedVersion: 2 });
    await c.discard(user, 'p', 'd', { expectedVersion: 2 });
    await c.correct(user, 'p', 'd', {
      expectedVersion: 2,
      instruction: 'fact',
    });
    expect(service.correct).toHaveBeenCalledWith('user', 'p', 'd', 2, 'fact');
  });
  it('separates public current content from contributor preview', async () => {
    const access = { requireMember: jest.fn(), requireContributor: jest.fn() };
    const publication = {
      readPublicCategories: jest.fn(),
      readPreview: jest.fn(),
    };
    const c = new ClientContentController(
      access as unknown as ProjectAccessService,
      publication as unknown as ClientPublicationService,
    );
    await c.current(user, 'p');
    await c.preview(user, 'p');
    expect(access.requireMember).toHaveBeenCalled();
    expect(access.requireContributor).toHaveBeenCalled();
  });
  it('delegates the compact workspace', async () => {
    const service = { get: jest.fn() };
    await new DocumentationWorkspaceController(
      service as unknown as DocumentationWorkspaceService,
    ).get(user, 'p');
    expect(service.get).toHaveBeenCalledWith('user', 'p');
  });
  it('delegates editorial lifecycle', async () => {
    const service = {
      get: jest.fn(),
      propose: jest.fn(),
      getProposal: jest.fn(),
      cancel: jest.fn(),
      confirm: jest.fn(),
    };
    const c = new EditorialProfileController(
      service as unknown as EditorialProfileService,
    );
    const body = {
      expectedVersion: 1,
      length: 'balanced' as const,
      pedagogy: 'guided' as const,
      technicalFamiliarity: 'novice' as const,
      tone: 'reassuring' as const,
      guidance: null,
    };
    await c.get(user, 'p');
    await c.propose(user, 'p', body);
    await c.proposal(user, 'p', 'proposal');
    await c.cancel(user, 'p', 'proposal', { expectedVersion: 2 });
    await c.confirm(user, 'p', 'proposal', {
      expectedVersion: 2,
      confirmed: true,
    });
    expect(service.confirm).toHaveBeenCalledWith('user', 'p', 'proposal', 2);
  });
});
