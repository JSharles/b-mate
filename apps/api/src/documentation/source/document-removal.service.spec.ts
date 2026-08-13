import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProjectAccessService } from '../../projects/project-access.service';
import { asPrismaService, createPrismaMock } from '../../test/prisma-mock';
import { ReferenceDocumentService } from '../reference/reference-document.service';
import { DocumentStorageClient } from './document-storage.client';
import { DocumentRemovalService } from './document-removal.service';

const projectId = '00000000-0000-4000-8000-000000000001';
const documentId = '00000000-0000-4000-8000-000000000002';
const userId = 'user-1';

describe('DocumentRemovalService', () => {
  function setup() {
    const prisma = createPrismaMock();
    const access = {
      requireContributor: jest.fn().mockResolvedValue({ role: 'contributor' }),
    };
    const storage = { delete: jest.fn().mockResolvedValue(undefined) };
    const reference = {
      write: jest.fn().mockResolvedValue({ documentId: 'r' }),
    };
    return {
      prisma,
      access,
      storage,
      reference,
      service: new DocumentRemovalService(
        asPrismaService(prisma),
        access as unknown as ProjectAccessService,
        storage as unknown as DocumentStorageClient,
        reference as unknown as ReferenceDocumentService,
      ),
    };
  }

  function removable(prisma: ReturnType<typeof createPrismaMock>) {
    prisma.sourceDocument.findFirst.mockResolvedValue({
      id: documentId,
      version: 3,
      title: 'Cahier des charges',
    });
    prisma.sourceDocument.count.mockResolvedValue(1);
    prisma.referenceDocument.count.mockResolvedValue(1);
  }

  describe('the preview', () => {
    // What the contributor needs before confirming is what the project is left
    // with — there are no statements to count support for any more.
    it('says what would remain and that the document is owed a rewrite', async () => {
      const { prisma, service } = setup();
      removable(prisma);

      await expect(
        service.preview(userId, projectId, documentId),
      ).resolves.toMatchObject({
        documentId,
        documentVersion: 3,
        title: 'Cahier des charges',
        remainingDocumentCount: 1,
        referenceNeedsRewrite: true,
      });
    });

    // Removing the last document leaves a project that cannot write a reference
    // document at all, which is worth knowing before rather than after.
    it('reports a project left with nothing', async () => {
      const { prisma, service } = setup();
      removable(prisma);
      prisma.sourceDocument.count.mockResolvedValue(0);

      await expect(
        service.preview(userId, projectId, documentId),
      ).resolves.toMatchObject({ remainingDocumentCount: 0 });
    });

    it('says nothing about a rewrite on a project that never wrote one', async () => {
      const { prisma, service } = setup();
      removable(prisma);
      prisma.referenceDocument.count.mockResolvedValue(0);

      await expect(
        service.preview(userId, projectId, documentId),
      ).resolves.toMatchObject({ referenceNeedsRewrite: false });
    });

    it('hides a document already removed', async () => {
      const { prisma, service } = setup();
      prisma.sourceDocument.findFirst.mockResolvedValue(null);

      await expect(
        service.preview(userId, projectId, documentId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('hides a project the caller is not a contributor on', async () => {
      const { access, service } = setup();
      access.requireContributor.mockRejectedValue(
        new NotFoundException({ code: 'NOT_FOUND' }),
      );

      await expect(
        service.preview(userId, projectId, documentId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('confirming', () => {
    function confirmable(prisma: ReturnType<typeof createPrismaMock>) {
      prisma.sourceDocument.updateMany.mockResolvedValue({ count: 1 });
      prisma.project.update.mockResolvedValue({ id: projectId });
      prisma.sourceDocument.findUnique.mockResolvedValue({
        storedObjectKey: 'documentation/p/d/original.pdf',
      });
    }

    it('removes the document and deletes what was stored for it', async () => {
      const { prisma, storage, service } = setup();
      confirmable(prisma);

      await expect(
        service.confirm(userId, projectId, documentId, {
          expectedDocumentVersion: 3,
        }),
      ).resolves.toEqual({ documentId, removed: true });
      expect(storage.delete).toHaveBeenCalledWith(
        'documentation/p/d/original.pdf',
      );
    });

    // What the corpus holds changed, so the reference document is rewritten —
    // the same rule as adding one.
    it('rewrites the reference document without the document just removed', async () => {
      const { prisma, reference, service } = setup();
      confirmable(prisma);

      await service.confirm(
        userId,
        projectId,
        documentId,
        { expectedDocumentVersion: 3 },
        'fr',
      );

      expect(prisma.project.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { referenceNeedsRewrite: true } }),
      );
      expect(reference.write).toHaveBeenCalledWith(userId, projectId, 'fr');
    });

    // Removing the last document leaves nothing to write from. That is not a
    // reason to refuse the removal: the document is gone either way.
    it('removes the last document even though nothing can be written from none', async () => {
      const { prisma, reference, service } = setup();
      confirmable(prisma);
      reference.write.mockRejectedValue(
        new BadRequestException({ code: 'NO_DOCUMENTS' }),
      );

      await expect(
        service.confirm(userId, projectId, documentId, {
          expectedDocumentVersion: 3,
        }),
      ).resolves.toEqual({ documentId, removed: true });
    });

    // A document that moved under the confirmation is refused: the decision was
    // taken about something the contributor is no longer looking at.
    it('fails closed when the document moved since the preview', async () => {
      const { prisma, service } = setup();
      confirmable(prisma);
      prisma.sourceDocument.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.confirm(userId, projectId, documentId, {
          expectedDocumentVersion: 3,
        }),
      ).rejects.toMatchObject({ response: { code: 'STALE_REMOVAL' } });
    });

    // The row is what makes the document gone; the bytes are cleanup. A storage
    // failure must not leave a document the contributor removed and still sees.
    it('still removes the document when the stored object cannot be deleted', async () => {
      const { prisma, storage, service } = setup();
      confirmable(prisma);
      storage.delete.mockRejectedValue(new Error('R2 is down'));

      await expect(
        service.confirm(userId, projectId, documentId, {
          expectedDocumentVersion: 3,
        }),
      ).resolves.toEqual({ documentId, removed: true });
    });

    it('does not call storage for a document that never stored anything', async () => {
      const { prisma, storage, service } = setup();
      confirmable(prisma);
      prisma.sourceDocument.findUnique.mockResolvedValue({
        storedObjectKey: null,
      });

      await service.confirm(userId, projectId, documentId, {
        expectedDocumentVersion: 3,
      });

      expect(storage.delete).not.toHaveBeenCalled();
    });
  });
});
