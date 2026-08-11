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
    Pick<
      SourceDocumentService,
      | 'addUpload'
      | 'addNotion'
      | 'list'
      | 'detail'
      | 'retryProcessing'
      | 'cancelProcessing'
    >
  >;
  let controller: SourceDocumentsController;
  let removal: jest.Mocked<
    Pick<DocumentRemovalService, 'preview' | 'confirm' | 'retry'>
  >;

  beforeEach(() => {
    service = {
      addUpload: jest.fn(),
      addNotion: jest.fn(),
      list: jest.fn(),
      detail: jest.fn(),
      retryProcessing: jest.fn(),
      cancelProcessing: jest.fn(),
    };
    removal = {
      preview: jest.fn(),
      confirm: jest.fn(),
      retry: jest.fn(),
    };
    controller = new SourceDocumentsController(
      service as unknown as SourceDocumentService,
      removal as unknown as DocumentRemovalService,
    );
  });

  it('delegates upload and Notion snapshot creation to the contributor service', async () => {
    service.addUpload.mockResolvedValue({} as never);
    service.addNotion.mockResolvedValue({} as never);

    await controller.upload(user, 'project-1', file);
    await controller.addNotion(user, 'project-1', {
      pageUrl: 'https://notion.so/Cadrage-0123456789abcdef0123456789abcdef',
    });

    expect(service.addUpload).toHaveBeenCalledWith('user-1', 'project-1', file);
    expect(service.addNotion).toHaveBeenCalledWith(
      'user-1',
      'project-1',
      'https://notion.so/Cadrage-0123456789abcdef0123456789abcdef',
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

  it('delegates preview, confirmed removal, and recovery with exact identities', async () => {
    removal.preview.mockResolvedValue({} as never);
    removal.confirm.mockResolvedValue({} as never);
    removal.retry.mockResolvedValue({} as never);
    const confirmation = {
      expectedDocumentVersion: 2,
      expectedSourceRevisionId: '00000000-0000-4000-8000-000000000001',
      confirmationToken: 'a'.repeat(64),
      confirmed: true as const,
    };
    await controller.removalPreview(user, 'project-1', 'document-1');
    await controller.confirmRemoval(
      user,
      'project-1',
      'document-1',
      confirmation,
    );
    await controller.retryRemoval(user, 'project-1', 'document-1');
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
    );
    expect(removal.retry).toHaveBeenCalledWith(
      'user-1',
      'project-1',
      'document-1',
    );
  });

  it('delegates stopping a document that is being processed', async () => {
    service.cancelProcessing.mockResolvedValue({ cancelledOperationCount: 1 });

    await controller.cancelProcessing(user, 'project-1', 'document-1');

    expect(service.cancelProcessing).toHaveBeenCalledWith(
      'user-1',
      'project-1',
      'document-1',
    );
  });

  it('delegates a failed document processing retry', async () => {
    service.retryProcessing.mockResolvedValue({
      operationId: 'operation-2',
      status: 'queued',
    });

    await controller.retryProcessing(user, 'project-1', 'document-1');

    expect(service.retryProcessing).toHaveBeenCalledWith(
      'user-1',
      'project-1',
      'document-1',
    );
  });
});
