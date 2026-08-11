import type { User } from '@prisma/client';
import { SourceRevisionService } from '../source/source-revision.service';
import { CanonicalSourceController } from './canonical-source.controller';
import { SourceCorrectionService } from '../source/source-correction.service';

const user = { id: 'user-1' } as User;

describe('CanonicalSourceController', () => {
  let service: jest.Mocked<
    Pick<
      SourceRevisionService,
      'readSource' | 'listRevisions' | 'readProvenance'
    >
  >;
  let controller: CanonicalSourceController;
  let corrections: jest.Mocked<Pick<SourceCorrectionService, 'correct'>>;

  beforeEach(() => {
    service = {
      readSource: jest.fn(),
      listRevisions: jest.fn(),
      readProvenance: jest.fn(),
    };
    corrections = { correct: jest.fn() };
    controller = new CanonicalSourceController(
      service as unknown as SourceRevisionService,
      corrections as unknown as SourceCorrectionService,
    );
  });

  it('supports current or historical canonical source reads with cursors', async () => {
    service.readSource.mockResolvedValue({} as never);

    await controller.read(user, 'project-1', 'revision-1', 'cursor-1');

    expect(service.readSource).toHaveBeenCalledWith('user-1', 'project-1', {
      revisionId: 'revision-1',
      cursor: 'cursor-1',
    });
  });

  it('delegates revision history and provenance without translating hidden 404s', async () => {
    service.listRevisions.mockResolvedValue({} as never);
    service.readProvenance.mockRejectedValue({
      status: 404,
      response: { code: 'NOT_FOUND' },
    });

    await controller.revisions(user, 'project-1', 'cursor-2');
    await expect(
      controller.provenance(user, 'project-1', 'item-1', 'revision-1'),
    ).rejects.toEqual({ status: 404, response: { code: 'NOT_FOUND' } });

    expect(service.listRevisions).toHaveBeenCalledWith(
      'user-1',
      'project-1',
      'cursor-2',
    );
    expect(service.readProvenance).toHaveBeenCalledWith(
      'user-1',
      'project-1',
      'item-1',
      'revision-1',
    );
  });
});
