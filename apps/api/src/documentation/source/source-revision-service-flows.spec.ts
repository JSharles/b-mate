import { asPrismaService, createPrismaMock } from '../../test/prisma-mock';
import { ProjectAccessService } from '../../projects/project-access.service';
import { SourceRevisionService } from './source-revision.service';
const projectId = '00000000-0000-4000-8000-000000000001';
const sourceId = '00000000-0000-4000-8000-000000000002';
const revisionId = '00000000-0000-4000-8000-000000000003';
const item = (id: string, categoryKey = 'overview') => ({
  id: `${id}-revision`,
  informationItemId: id,
  kind: 'fact',
  state: 'point_to_clarify',
  content: `content-${id}`,
  sortOrder: 0,
  categories: [{ categoryKey }],
  provenanceLinks: [
    {
      documentObservationId: 'observation',
      contributorAssertionId: null,
      role: 'supports',
    },
  ],
});
describe('SourceRevisionService flows', () => {
  function setup() {
    const prisma = createPrismaMock();
    const access = { requireContributor: jest.fn() };
    const service = new SourceRevisionService(
      asPrismaService(prisma),
      access as unknown as ProjectAccessService,
    );
    const source = {
      id: sourceId,
      projectId,
      currentRevisionId: revisionId,
      nextSequence: 2,
      workingLanguage: 'fr',
    };
    prisma.projectSource.findUnique.mockResolvedValue(source);
    prisma.projectSource.findUniqueOrThrow.mockResolvedValue(source);
    prisma.sourceRevisionItem.findMany.mockResolvedValue([
      item('item-1'),
      item('item-2', 'planning'),
    ]);
    prisma.sourceRevision.create.mockResolvedValue({ id: 'new-revision' });
    prisma.sourceRevisionItem.create
      .mockResolvedValueOnce({ id: 'new-item-1' })
      .mockResolvedValueOnce({ id: 'new-item-2' });
    prisma.projectSource.updateMany.mockResolvedValue({ count: 1 });
    return { prisma, service };
  }
  it('reads paginated canonical source, revisions, and both provenance origin kinds', async () => {
    const { prisma, service } = setup();
    prisma.sourceRevision.findFirst.mockResolvedValue({
      id: revisionId,
      sequence: 1,
      trigger: 'document_added',
      summary: 'Added',
      createdAt: new Date(),
      impacts: [{ categoryKey: 'overview' }],
    });
    const rows = Array.from({ length: 51 }, (_, index) => ({
      ...item(`item-${index}`),
      id: `row-${index}`,
      informationItem: { clarificationItems: [] },
      provenanceLinks: [{}],
    }));
    prisma.sourceRevisionItem.count.mockResolvedValue(51);
    prisma.sourceRevisionItem.findMany.mockResolvedValue(rows);
    await expect(
      service.readSource('user', projectId, { cursor: 'cursor' }),
    ).resolves.toMatchObject({ total: 51, nextCursor: 'row-49' });
    prisma.sourceRevision.count.mockResolvedValue(51);
    prisma.sourceRevision.findMany.mockResolvedValue(
      Array.from({ length: 51 }, (_, index) => ({
        id: `revision-${index}`,
        sequence: index + 1,
        trigger: 'document_added',
        summary: 'Added',
        createdAt: new Date(),
        impacts: [],
      })),
    );
    await expect(
      service.listRevisions('user', projectId, 'cursor'),
    ).resolves.toMatchObject({ total: 51, nextCursor: 'revision-49' });
    prisma.sourceRevisionItem.findFirst.mockResolvedValue({
      informationItemId: 'item-1',
      sourceRevisionId: revisionId,
      sourceRevision: { sequence: 1 },
      provenanceLinks: [
        {
          role: 'supports',
          documentObservation: {
            sourceDocumentId: 'doc',
            originalExcerpt: 'Excerpt',
            locator: null,
            sourceDocument: { title: 'Brief' },
          },
          contributorAssertion: null,
        },
        {
          role: 'confirms',
          documentObservation: null,
          contributorAssertion: {
            content: 'Answer',
            authorUser: { firstName: 'Ada', lastName: 'Lovelace' },
          },
        },
      ],
    });
    prisma.sourceRevisionChange.findMany.mockResolvedValue([
      {
        sourceRevisionId: revisionId,
        kind: 'added',
        sourceRevision: { sequence: 1, createdAt: new Date('2026-01-01') },
      },
    ]);
    await expect(
      service.readProvenance('user', projectId, 'item-1'),
    ).resolves.toMatchObject({
      origins: [
        { kind: 'document' },
        { kind: 'contributor', label: 'Ada Lovelace' },
      ],
      history: [{ change: 'added' }],
    });
  });
  it('commits clarification answers with answered and unchanged items', async () => {
    const { prisma, service } = setup();
    await expect(
      service.commitClarificationAnswers(asPrismaService(prisma) as never, {
        projectId,
        projectSourceId: sourceId,
        expectedSourceRevisionId: revisionId,
        userId: 'user',
        answers: [
          {
            clarificationId: 'clarification',
            assertionId: 'assertion',
            informationItemIds: ['item-1'],
            content: 'resolved',
          },
        ],
      }),
    ).resolves.toEqual({ status: 'committed', revisionId: 'new-revision' });
    expect(prisma.sourceRevisionChange.create).toHaveBeenCalledTimes(1);
    expect(prisma.categoryProjectionState.upsert).toHaveBeenCalled();
  });
  it('rejects duplicate or unknown clarification item answers and returns stale heads', async () => {
    const { prisma, service } = setup();
    await expect(
      service.commitClarificationAnswers(asPrismaService(prisma) as never, {
        projectId,
        projectSourceId: sourceId,
        expectedSourceRevisionId: revisionId,
        userId: 'user',
        answers: [
          {
            clarificationId: 'a',
            assertionId: 'a1',
            informationItemIds: ['item-1'],
            content: 'x',
          },
          {
            clarificationId: 'b',
            assertionId: 'a2',
            informationItemIds: ['item-1'],
            content: 'y',
          },
        ],
      }),
    ).rejects.toThrow('Two answers');
    await expect(
      service.commitClarificationAnswers(asPrismaService(prisma) as never, {
        projectId,
        projectSourceId: sourceId,
        expectedSourceRevisionId: revisionId,
        userId: 'user',
        answers: [
          {
            clarificationId: 'a',
            assertionId: 'a1',
            informationItemIds: ['unknown'],
            content: 'x',
          },
        ],
      }),
    ).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
    prisma.projectSource.findUniqueOrThrow.mockResolvedValue({
      id: sourceId,
      currentRevisionId: 'newer',
      nextSequence: 3,
    });
    await expect(
      service.commitClarificationAnswers(asPrismaService(prisma) as never, {
        projectId,
        projectSourceId: sourceId,
        expectedSourceRevisionId: revisionId,
        userId: 'user',
        answers: [],
      }),
    ).resolves.toEqual({ status: 'stale', currentRevisionId: 'newer' });
  });
  it('commits guided correction with attributable provenance and isolated impacts', async () => {
    const { prisma, service } = setup();
    await expect(
      service.commitGuidedCorrection(asPrismaService(prisma) as never, {
        projectId,
        projectSourceId: sourceId,
        informationItemId: 'item-1',
        assertionId: 'assertion',
        correctedContent: 'corrected',
        expectedSourceRevisionId: revisionId,
        userId: 'user',
      }),
    ).resolves.toEqual({ status: 'committed', revisionId: 'new-revision' });
    expect(prisma.sourceRevisionItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: 'corrected' }),
      }),
    );
  });
  it('commits complete language translations and rejects duplicate/incomplete accounting', async () => {
    const { prisma, service } = setup();
    await expect(
      service.commitLanguageChange(asPrismaService(prisma) as never, {
        projectId,
        projectSourceId: sourceId,
        expectedSourceRevisionId: revisionId,
        toLanguage: 'en',
        userId: 'user',
        translations: [
          { informationItemId: 'item-1', translatedContent: 'one' },
          { informationItemId: 'item-2', translatedContent: 'two' },
        ],
      }),
    ).resolves.toEqual({ status: 'committed', revisionId: 'new-revision' });
    expect(prisma.sourceRevisionChange.create).toHaveBeenCalledTimes(2);
    const duplicate = [
      { informationItemId: 'item-1', translatedContent: 'one' },
      { informationItemId: 'item-1', translatedContent: 'again' },
    ];
    await expect(
      service.commitLanguageChange(asPrismaService(prisma) as never, {
        projectId,
        projectSourceId: sourceId,
        expectedSourceRevisionId: revisionId,
        toLanguage: 'en',
        userId: 'user',
        translations: duplicate,
      }),
    ).rejects.toThrow('duplicate');
    await expect(
      service.commitLanguageChange(asPrismaService(prisma) as never, {
        projectId,
        projectSourceId: sourceId,
        expectedSourceRevisionId: revisionId,
        toLanguage: 'en',
        userId: 'user',
        translations: [],
      }),
    ).rejects.toThrow('account for every');
  });
});
