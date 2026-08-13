import type { User } from '@prisma/client';
import { ReferenceDocumentService } from '../reference/reference-document.service';
import { ReferenceDocumentController } from './reference-document.controller';

const projectId = '00000000-0000-4000-8000-000000000001';

describe('ReferenceDocumentController', () => {
  function setup() {
    const reference = {
      current: jest.fn(),
      summary: jest.fn(),
      write: jest.fn(),
    };
    return {
      reference,
      controller: new ReferenceDocumentController(
        reference as unknown as ReferenceDocumentService,
      ),
    };
  }

  it('reads the current document', async () => {
    const { reference, controller } = setup();
    reference.current.mockResolvedValue(null);

    await expect(
      controller.current({ id: 'user-1' } as User, projectId),
    ).resolves.toBeNull();
    expect(reference.current).toHaveBeenCalledWith('user-1', projectId);
  });

  it('reads the summary', async () => {
    const { reference, controller } = setup();
    reference.summary.mockResolvedValue({ statementCount: 0 });

    await controller.summary({ id: 'user-1' } as User, projectId);

    expect(reference.summary).toHaveBeenCalledWith('user-1', projectId);
  });

  // Reading the header as well as the stored value means a developer's very
  // first write is already in their language, without waiting for a second
  // request to have taught the API what it is.
  it('prefers the language the request arrived in', async () => {
    const { reference, controller } = setup();
    reference.write.mockResolvedValue({ documentId: 'd' });

    await controller.write(
      { id: 'user-1', locale: 'en' } as User,
      projectId,
      'fr',
    );

    expect(reference.write).toHaveBeenCalledWith('user-1', projectId, 'fr');
  });

  it('falls back to the language remembered on the account', async () => {
    const { reference, controller } = setup();
    reference.write.mockResolvedValue({ documentId: 'd' });

    await controller.write({ id: 'user-1', locale: 'fr' } as User, projectId);

    expect(reference.write).toHaveBeenCalledWith('user-1', projectId, 'fr');
  });

  it('passes nothing when neither is known, and lets the service fall back', async () => {
    const { reference, controller } = setup();
    reference.write.mockResolvedValue({ documentId: 'd' });

    await controller.write({ id: 'user-1' } as User, projectId);

    expect(reference.write).toHaveBeenCalledWith('user-1', projectId, null);
  });
});
