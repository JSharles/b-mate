import type { User } from '@prisma/client';
import { SourceDocumentService } from '../source/source-document.service';
import { DocumentRemovalService } from '../source/document-removal.service';
import { SourceDocumentsController } from './source-documents.controller';

const user = { id: 'user-1' } as User;
const file = {
  buffer: Buffer.from('%PDF'),
  originalname: 'brief.pdf',
  mimetype: 'application/pdf',
  size: 4,
} as Express.Multer.File;

describe('SourceDocumentsController', () => {
  let service: jest.Mocked<
    Pick<SourceDocumentService, 'addUpload' | 'addNotion' | 'list' | 'detail'>
  >;
  let controller: SourceDocumentsController;
  let removal: jest.Mocked<Pick<DocumentRemovalService, 'preview' | 'confirm'>>;

  beforeEach(() => {
    service = {
      addUpload: jest.fn(),
      addNotion: jest.fn(),
      list: jest.fn(),
      detail: jest.fn(),
    };
    removal = { preview: jest.fn(), confirm: jest.fn() };
    controller = new SourceDocumentsController(
      service as unknown as SourceDocumentService,
      removal as unknown as DocumentRemovalService,
    );
  });

  it('delegates upload and Notion snapshot creation to the contributor service', async () => {
    service.addUpload.mockResolvedValue({} as never);
    service.addNotion.mockResolvedValue({} as never);

    await controller.upload(user, 'project-1', file, 'fr');
    // No header on this one: the language remembered on the account is what a
    // background write falls back to.
    await controller.addNotion(user, 'project-1', {
      pageUrl: 'https://notion.so/Cadrage-0123456789abcdef0123456789abcdef',
    });

    expect(service.addUpload).toHaveBeenCalledWith(
      'user-1',
      'project-1',
      file,
      'fr',
    );
    expect(service.addNotion).toHaveBeenCalledWith(
      'user-1',
      'project-1',
      'https://notion.so/Cadrage-0123456789abcdef0123456789abcdef',
      null,
    );
  });

  it('passes cursor access and document identity without leaking access decisions', async () => {
    service.list.mockResolvedValue({
      items: [],
      total: 0,
      nextCursor: null,
    });
    service.detail.mockRejectedValue({
      status: 404,
      response: { code: 'NOT_FOUND' },
    });

    await controller.list(user, 'project-1', 'cursor-1');
    await expect(
      controller.detail(user, 'project-1', 'document-1'),
    ).rejects.toEqual({ status: 404, response: { code: 'NOT_FOUND' } });

    expect(service.list).toHaveBeenCalledWith(
      'user-1',
      'project-1',
      'cursor-1',
    );
    expect(service.detail).toHaveBeenCalledWith(
      'user-1',
      'project-1',
      'document-1',
    );
  });

  it('delegates preview and confirmed removal with exact identities', async () => {
    removal.preview.mockResolvedValue({} as never);
    removal.confirm.mockResolvedValue({} as never);
    const confirmation = {
      expectedDocumentVersion: 2,
      confirmed: true as const,
    };

    await controller.removalPreview(user, 'project-1', 'document-1');
    await controller.confirmRemoval(
      user,
      'project-1',
      'document-1',
      confirmation,
      'fr',
    );

    expect(removal.preview).toHaveBeenCalledWith(
      'user-1',
      'project-1',
      'document-1',
    );
    expect(removal.confirm).toHaveBeenCalledWith(
      'user-1',
      'project-1',
      'document-1',
      confirmation,
      'fr',
    );
  });
});
