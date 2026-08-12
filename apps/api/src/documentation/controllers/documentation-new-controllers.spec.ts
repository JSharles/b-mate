import type { User } from '@prisma/client';
import { ClientContentController } from './client-content.controller';
import { DocumentationWorkspaceController } from './documentation-workspace.controller';
import { ClientPublicationService } from '../publication/client-publication.service';
import { ProjectAccessService } from '../../projects/project-access.service';
import { DocumentationWorkspaceService } from '../workspace/documentation-workspace.service';
const user = { id: 'user' } as User;
describe('documentation controllers', () => {
  it('separates public current content from contributor preview', async () => {
    const access = { requireMember: jest.fn(), requireContributor: jest.fn() };
    const publication = {
      readPublicSections: jest.fn(),
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
});
