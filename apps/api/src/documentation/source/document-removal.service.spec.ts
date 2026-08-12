import { asPrismaService, createPrismaMock } from '../../test/prisma-mock';
import { ProjectAccessService } from '../../projects/project-access.service';
import { DocumentStorageClient } from './document-storage.client';
import { DocumentRemovalService } from './document-removal.service';
const projectId = '00000000-0000-4000-8000-000000000001';
const documentId = '00000000-0000-4000-8000-000000000002';
const revisionId = '00000000-0000-4000-8000-000000000003';
describe('DocumentRemovalService', () => {
  function setup() {
    const prisma = createPrismaMock();
    const access = { requireContributor: jest.fn() };
    const storage = { delete: jest.fn() };
    return {
      prisma,
      storage,
      service: new DocumentRemovalService(
        asPrismaService(prisma),
        access as unknown as ProjectAccessService,
        storage as unknown as DocumentStorageClient,
      ),
    };
  }
  it('previews affected and sole-support counts with an optimistic token', async () => {
    const { prisma, service } = setup();
    prisma.sourceDocument.findFirst.mockResolvedValue({
      id: documentId,
      version: 2,
      observations: [
        { categories: [{ categoryKey: 'overview' }] },
        { categories: [{ categoryKey: 'planning' }] },
      ],
      project: { projectSource: { currentRevisionId: revisionId } },
    });
    prisma.provenanceLink.findMany.mockResolvedValue([
      { sourceRevisionItemId: 'item-1' },
      { sourceRevisionItemId: 'item-2' },
      { sourceRevisionItemId: 'item-1' },
    ]);
    prisma.provenanceLink.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    await expect(
      service.preview('user', projectId, documentId),
    ).resolves.toMatchObject({
      documentVersion: 2,
      supportedItemCount: 2,
      soleSupportItemCount: 1,
      confirmationToken: expect.any(String),
    });
  });
  it.each([
    ['missing document', null],
    [
      'source without a revision',
      {
        id: documentId,
        version: 1,
        observations: [],
        project: { projectSource: { currentRevisionId: null } },
      },
    ],
  ])('hides a %s during preview', async (_label, document) => {
    const { prisma, service } = setup();
    prisma.sourceDocument.findFirst.mockResolvedValue(document);
    await expect(
      service.preview('user', projectId, documentId),
    ).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
  });
  it('previews and removes a failed document that never reached the canonical source', async () => {
    const { prisma, storage, service } = setup();
    prisma.sourceDocument.findFirst.mockResolvedValue({
      id: documentId,
      status: 'failed',
      version: 1,
      storedObjectKey: 'failed-original',
      observations: [],
      project: { projectSource: null },
    });
    const preview = await service.preview('user', projectId, documentId);
    expect(preview).toMatchObject({
      sourceRevisionId: null,
      observationCount: 0,
      supportedItemCount: 0,
    });
    prisma.sourceDocument.updateMany.mockResolvedValue({ count: 1 });
    prisma.sourceDocument.findUnique.mockResolvedValue({
      storedObjectKey: 'failed-original',
    });
    storage.delete.mockResolvedValue(undefined);

    await expect(
      service.confirm('user', projectId, documentId, {
        expectedDocumentVersion: preview.documentVersion,
        expectedSourceRevisionId: preview.sourceRevisionId,
        confirmationToken: preview.confirmationToken,
      }),
    ).resolves.toEqual({ status: 'completed' });
    expect(storage.delete).toHaveBeenCalledWith('failed-original');
    expect(prisma.sourceRevision.create).not.toHaveBeenCalled();
    expect(prisma.sourceDocument.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'removed',
          storedObjectKey: null,
        }),
      }),
    );
  });
  it('fails closed on a stale confirmation', async () => {
    const { service } = setup();
    await expect(
      service.confirm('user', projectId, documentId, {
        expectedDocumentVersion: 2,
        expectedSourceRevisionId: revisionId,
        confirmationToken: 'wrong-token-value',
      }),
    ).rejects.toMatchObject({ response: { code: 'STALE_REMOVAL_PREVIEW' } });
  });
  it('rejects a confirmation when the preview version was already claimed', async () => {
    const { prisma, service } = setup();
    const preview = await tokenFor(service, prisma);
    prisma.sourceDocument.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.confirm('user', projectId, documentId, preview),
    ).rejects.toMatchObject({ response: { code: 'STALE_REMOVAL_PREVIEW' } });
  });

  it('continues without a storage key and rebuilds against the locked current source', async () => {
    const { prisma, storage, service } = setup();
    const preview = await tokenFor(service, prisma);
    prisma.sourceDocument.updateMany.mockResolvedValue({ count: 1 });
    prisma.sourceDocument.findUnique.mockResolvedValue({
      storedObjectKey: null,
    });
    jest
      .spyOn(
        service as unknown as { rebuild: () => Promise<string> },
        'rebuild',
      )
      .mockResolvedValue('rebuilt-revision');
    await expect(
      service.confirm('user', projectId, documentId, preview),
    ).resolves.toEqual({
      status: 'completed',
      revisionId: 'rebuilt-revision',
    });
    expect(storage.delete).not.toHaveBeenCalled();
  });
  it('keeps source state and exposes attention when R2 deletion fails', async () => {
    const { prisma, storage, service } = setup();
    const preview = await tokenFor(service, prisma);
    prisma.sourceDocument.updateMany.mockResolvedValue({ count: 1 });
    prisma.sourceDocument.findUnique.mockResolvedValue({
      storedObjectKey: 'key',
    });
    storage.delete.mockRejectedValue(new Error('down'));
    await expect(
      service.confirm('user', projectId, documentId, preview),
    ).resolves.toMatchObject({ status: 'needs_attention' });
    expect(prisma.sourceRevision.create).not.toHaveBeenCalled();
    expect(prisma.sourceDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'removal_failed' }),
      }),
    );
  });
  it('rebuilds a full snapshot from surviving support, removes sole facts, and restores prior truth', async () => {
    const { prisma, storage, service } = setup();
    const preview = await tokenFor(service, prisma);
    prisma.sourceDocument.updateMany.mockResolvedValue({ count: 1 });
    prisma.sourceDocument.findUnique.mockResolvedValue({
      storedObjectKey: 'key',
    });
    storage.delete.mockResolvedValue(undefined);
    const removedLink = {
      documentObservationId: 'obs-removed',
      contributorAssertionId: null,
      role: 'supports',
      documentObservation: { sourceDocumentId: documentId },
    };
    const survivingLink = {
      documentObservationId: 'obs-other',
      contributorAssertionId: null,
      role: 'supports',
      documentObservation: { sourceDocumentId: 'other' },
    };
    const item = (id: string, links: unknown[]) => ({
      id: `${id}-revision`,
      informationItemId: id,
      kind: 'fact',
      state: 'confirmed',
      content: `current-${id}`,
      sortOrder: 1,
      provenanceLinks: links,
    });
    prisma.projectSource.findUnique.mockResolvedValue({
      id: 'source',
      currentRevisionId: revisionId,
      nextSequence: 2,
      currentRevision: {
        id: revisionId,
        sequence: 1,
        items: [
          item('keep', [removedLink, survivingLink]),
          item('drop', [removedLink]),
          item('restore', [removedLink]),
        ],
      },
    });
    prisma.sourceRevisionItem.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        ...item('restore-old', [survivingLink]),
        id: 'old-revision',
        informationItemId: 'restore',
        content: 'old-supported',
      });
    prisma.sourceRevision.create.mockResolvedValue({ id: 'new-revision' });
    prisma.sourceRevisionItem.create
      .mockResolvedValueOnce({ id: 'new-keep' })
      .mockResolvedValueOnce({ id: 'new-restore' });
    await expect(
      service.confirm('user', projectId, documentId, preview),
    ).resolves.toEqual({ status: 'completed', revisionId: 'new-revision' });
    expect(prisma.sourceRevisionChange.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: 'removed' }),
      }),
    );
    expect(prisma.sourceRevisionChange.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: 'superseded' }),
      }),
    );
    expect(prisma.sourceDocument.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'removed',
          storedObjectKey: null,
        }),
      }),
    );
  });

  it('requires a retryable tombstone and preserves attention when retry storage deletion fails', async () => {
    const { prisma, storage, service } = setup();
    prisma.sourceDocument.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.retry('user', projectId, documentId),
    ).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });

    prisma.sourceDocument.findFirst.mockResolvedValue({
      storedObjectKey: 'stored-key',
      project: { projectSource: { currentRevisionId: revisionId } },
    });
    storage.delete.mockRejectedValueOnce(new Error('R2 down'));
    // Retry now names the reason like confirmation always did — the two share
    // one finalization path, so a contributor retrying gets the same answer
    // they got the first time rather than a bare "needs attention".
    await expect(service.retry('user', projectId, documentId)).resolves.toEqual(
      { status: 'needs_attention', code: 'DOCUMENT_STORAGE_REMOVAL_FAILED' },
    );
    expect(prisma.sourceDocument.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'removal_failed' }),
      }),
    );
  });

  it('recovers a removal left pending after an interrupted finalization', async () => {
    const { prisma, storage, service } = setup();
    prisma.sourceDocument.findFirst.mockResolvedValue({
      status: 'removal_pending',
      storedObjectKey: 'already-deleted-key',
      incorporatedInRevisionId: null,
      project: { projectSource: null },
    });
    storage.delete.mockResolvedValue(undefined);

    await expect(service.retry('user', projectId, documentId)).resolves.toEqual(
      { status: 'completed' },
    );

    expect(storage.delete).toHaveBeenCalledWith('already-deleted-key');
    expect(prisma.sourceDocument.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'removed',
          storedObjectKey: null,
        }),
      }),
    );
  });

  it('turns a failed finalization into an explicitly retryable state', async () => {
    const { prisma, storage, service } = setup();
    prisma.sourceDocument.findFirst.mockResolvedValue({
      id: documentId,
      status: 'failed',
      version: 2,
      observations: [],
      project: { projectSource: null },
    });
    const removalPreview = await service.preview('user', projectId, documentId);
    const preview = {
      expectedDocumentVersion: removalPreview.documentVersion,
      expectedSourceRevisionId: removalPreview.sourceRevisionId,
      confirmationToken: removalPreview.confirmationToken,
    };
    prisma.sourceDocument.updateMany.mockResolvedValue({ count: 1 });
    prisma.sourceDocument.findUnique.mockResolvedValue({
      storedObjectKey: 'stored-key',
    });
    storage.delete.mockResolvedValue(undefined);
    prisma.sourceDocument.update
      .mockRejectedValueOnce(new Error('constraint failure'))
      .mockResolvedValueOnce({});

    await expect(
      service.confirm('user', projectId, documentId, preview),
    ).resolves.toEqual({
      status: 'needs_attention',
      code: 'DOCUMENT_REMOVAL_FINALIZATION_FAILED',
    });
    expect(prisma.sourceDocument.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'removal_failed',
          failureCode: 'DOCUMENT_REMOVAL_FINALIZATION_FAILED',
        }),
      }),
    );
  });

  it('retries a removed Notion snapshot without issuing a redundant storage call', async () => {
    const { prisma, storage, service } = setup();
    prisma.sourceDocument.findFirst.mockResolvedValue({
      storedObjectKey: null,
      project: { projectSource: { currentRevisionId: revisionId } },
    });
    jest
      .spyOn(
        service as unknown as { rebuild: () => Promise<string> },
        'rebuild',
      )
      .mockResolvedValue('rebuilt-revision');
    await expect(service.retry('user', projectId, documentId)).resolves.toEqual(
      {
        status: 'completed',
        revisionId: 'rebuilt-revision',
      },
    );
    expect(storage.delete).not.toHaveBeenCalled();
  });
  async function tokenFor(
    service: DocumentRemovalService,
    prisma: ReturnType<typeof createPrismaMock>,
  ) {
    prisma.sourceDocument.findFirst.mockResolvedValue({
      id: documentId,
      version: 2,
      observations: [],
      project: { projectSource: { currentRevisionId: revisionId } },
    });
    prisma.provenanceLink.findMany.mockResolvedValue([]);
    const preview = await service.preview('user', projectId, documentId);
    return {
      expectedDocumentVersion: preview.documentVersion,
      expectedSourceRevisionId: preview.sourceRevisionId,
      confirmationToken: preview.confirmationToken,
    };
  }

  // `removal_pending` is held in memory by whichever request is finalizing.
  // When that process dies — a crash, a deploy, an API that will not boot —
  // nothing was left to drive it and the document sat behind a spinner that
  // would never resolve. Four documents were stranded that way in dev.
  describe('recovering removals abandoned mid-flight', () => {
    it('only considers a pending removal stalled once it has sat untouched', async () => {
      const { prisma, service } = setup();
      prisma.sourceDocument.findMany.mockResolvedValue([]);

      await service.recoverStalledRemovals();

      const [[call]] = prisma.sourceDocument.findMany.mock.calls as [
        [{ where: { status: string; updatedAt: { lt: Date } } }],
      ];
      expect(call.where.status).toBe('removal_pending');
      // A slow rebuild must never be mistaken for a crash and re-driven
      // underneath itself.
      expect(call.where.updatedAt.lt.getTime()).toBeLessThan(Date.now());
    });

    it('finishes a stalled removal that never reached the source', async () => {
      const { prisma, storage, service } = setup();
      prisma.sourceDocument.findMany.mockResolvedValue([
        {
          id: documentId,
          projectId,
          storedObjectKey: 'stored-key',
          incorporatedInRevisionId: null,
          addedByUserId: 'user-1',
          project: { projectSource: { currentRevisionId: revisionId } },
        },
      ]);

      await service.recoverStalledRemovals();

      expect(storage.delete).toHaveBeenCalledWith('stored-key');
      expect(prisma.sourceDocument.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'removed',
            storedObjectKey: null,
          }) as unknown,
        }),
      );
    });

    // A stall is a crash to recover from; a genuine failure is still a
    // decision to escalate, and lands where the contributor's retry can reach
    // it rather than being retried forever by the sweep.
    it('escalates to removal_failed when finalization genuinely fails', async () => {
      const { prisma, storage, service } = setup();
      prisma.sourceDocument.findMany.mockResolvedValue([
        {
          id: documentId,
          projectId,
          storedObjectKey: 'stored-key',
          incorporatedInRevisionId: null,
          addedByUserId: 'user-1',
          project: { projectSource: { currentRevisionId: revisionId } },
        },
      ]);
      storage.delete.mockRejectedValueOnce(new Error('R2 down'));

      await service.recoverStalledRemovals();

      expect(prisma.sourceDocument.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'removal_failed',
            failureCode: 'DOCUMENT_STORAGE_REMOVAL_FAILED',
          }) as unknown,
        }),
      );
    });

    it('keeps clearing the queue when one document cannot be recovered', async () => {
      const { prisma, storage, service } = setup();
      prisma.sourceDocument.findMany.mockResolvedValue([
        {
          id: 'doc-broken',
          projectId,
          storedObjectKey: 'key-1',
          incorporatedInRevisionId: null,
          addedByUserId: 'user-1',
          project: { projectSource: { currentRevisionId: revisionId } },
        },
        {
          id: documentId,
          projectId,
          storedObjectKey: 'key-2',
          incorporatedInRevisionId: null,
          addedByUserId: 'user-1',
          project: { projectSource: { currentRevisionId: revisionId } },
        },
      ]);
      prisma.sourceDocument.update.mockRejectedValueOnce(
        new Error('write conflict'),
      );

      await service.recoverStalledRemovals();

      expect(storage.delete).toHaveBeenCalledWith('key-2');
    });
  });
});
