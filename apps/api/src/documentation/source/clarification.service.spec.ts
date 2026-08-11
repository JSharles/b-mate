import { ConflictException, NotFoundException } from '@nestjs/common';
import { ProjectAccessService } from '../../projects/project-access.service';
import {
  asPrismaService,
  createPrismaMock,
  PrismaMock,
} from '../../test/prisma-mock';
import { ClarificationService } from './clarification.service';
import { SourceRevisionService } from './source-revision.service';

const id = (value: number) =>
  `00000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;

describe('ClarificationService', () => {
  let prisma: PrismaMock;
  let revisions: { commitClarificationAnswers: jest.Mock };
  let service: ClarificationService;

  beforeEach(() => {
    prisma = createPrismaMock();
    revisions = { commitClarificationAnswers: jest.fn() };
    service = new ClarificationService(
      asPrismaService(prisma),
      { requireContributor: jest.fn() } as unknown as ProjectAccessService,
      revisions as unknown as SourceRevisionService,
    );
  });

  it('returns every clarification through ranked cursor pages with attributable evidence', async () => {
    prisma.projectSource.findUnique.mockResolvedValue({
      id: id(2),
      currentRevisionId: id(3),
    });
    prisma.clarification.count.mockResolvedValue(7);
    prisma.clarification.findMany.mockResolvedValue([
      {
        id: id(4),
        question: 'Quelle date ?',
        impactRank: 1,
        impactExplanation: 'Change le planning.',
        status: 'open',
        version: 1,
        detectedInRevisionId: id(3),
        createdAt: new Date('2026-08-11T10:00:00Z'),
        items: [{ informationItemId: id(5) }],
        evidence: [
          {
            documentObservationId: id(6),
            contributorAssertionId: null,
            documentObservation: {
              originalExcerpt: '12 septembre',
              locator: { type: 'pdf_page', page: 1, excerpt: '12 septembre' },
              sourceDocument: { id: id(7), title: 'Planning' },
            },
            contributorAssertion: null,
          },
        ],
      },
    ]);

    const page = await service.list(id(1), id(8), { status: 'open' });

    expect(page.total).toBe(7);
    expect(page.items[0]).toMatchObject({
      impactRank: 1,
      openPointBlockId: id(4),
    });
    expect(page.items[0].evidence[0]).toMatchObject({
      label: 'Planning',
      excerpt: '12 septembre',
    });
    expect(prisma.clarification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ impactRank: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('returns an empty page before a source exists', async () => {
    prisma.projectSource.findUnique.mockResolvedValue(null);
    await expect(service.list(id(1), id(8), {})).resolves.toEqual({
      items: [],
      total: 0,
      nextCursor: null,
    });
  });

  it('filters by category, paginates, and attributes contributor evidence', async () => {
    prisma.projectSource.findUnique.mockResolvedValue({
      id: id(2),
      currentRevisionId: null,
    });
    const rows = Array.from({ length: 51 }, (_, index) => ({
      id: id(100 + index),
      question: `Question ${index}`,
      impactRank: index + 1,
      impactExplanation: null,
      status: 'left_open',
      version: 1,
      detectedInRevisionId: id(3),
      createdAt: new Date('2026-08-11T10:00:00Z'),
      items: [],
      evidence: [
        {
          documentObservation: null,
          contributorAssertion: {
            id: id(500 + index),
            content: 'Confirmed by the contributor',
            authorUser: { firstName: 'Ada', lastName: 'Lovelace' },
          },
        },
      ],
    }));
    prisma.clarification.count.mockResolvedValue(51);
    prisma.clarification.findMany.mockResolvedValue(rows);

    const page = await service.list(id(1), id(8), {
      categoryKey: 'overview',
      cursor: id(90),
    });

    expect(page.nextCursor).toBe(id(149));
    expect(page.items[0]?.evidence[0]).toMatchObject({
      kind: 'contributor',
      label: 'Ada Lovelace',
      locator: null,
    });
    expect(prisma.clarification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { id: id(90) }, skip: 1 }),
    );
  });

  it('fails closed when evidence has no origin', async () => {
    prisma.projectSource.findUnique.mockResolvedValue({ id: id(2) });
    prisma.clarification.findMany.mockResolvedValue([
      {
        id: id(4),
        question: 'Question',
        impactRank: 1,
        impactExplanation: null,
        status: 'open',
        version: 1,
        detectedInRevisionId: id(3),
        createdAt: new Date(),
        items: [],
        evidence: [{ documentObservation: null, contributorAssertion: null }],
      },
    ]);
    await expect(service.list(id(1), id(8), {})).rejects.toThrow(
      'evidence has no origin',
    );
  });

  it('answers and leaves open in one transaction while creating one source revision', async () => {
    prisma.projectSource.findUnique.mockResolvedValue({
      id: id(2),
      currentRevisionId: id(3),
    });
    prisma.clarification.findMany.mockResolvedValue([
      {
        id: id(4),
        status: 'open',
        version: 1,
        items: [{ informationItemId: id(5) }],
      },
      {
        id: id(6),
        status: 'open',
        version: 2,
        items: [{ informationItemId: id(7) }],
      },
    ]);
    prisma.contributorAssertion.create.mockResolvedValue({ id: id(9) });
    revisions.commitClarificationAnswers.mockResolvedValue({
      status: 'committed',
      revisionId: id(10),
    });

    const result = await service.resolve(id(1), id(8), {
      expectedSourceRevisionId: id(3),
      resolutions: [
        {
          clarificationId: id(4),
          expectedVersion: 1,
          action: 'answer',
          answer: '19 septembre',
        },
        { clarificationId: id(6), expectedVersion: 2, action: 'leave_open' },
      ],
    });

    expect(revisions.commitClarificationAnswers).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        answers: [expect.objectContaining({ content: '19 septembre' })],
      }),
    );
    expect(result).toMatchObject({
      sourceRevisionId: id(10),
      items: [
        { clarificationId: id(4), status: 'answered', version: 2 },
        { clarificationId: id(6), status: 'left_open', version: 3 },
      ],
    });
    expect(prisma.clarificationResolution.create).toHaveBeenCalledTimes(2);
  });

  it('rejects stale source and clarification versions without partial writes', async () => {
    prisma.projectSource.findUnique.mockResolvedValue({
      id: id(2),
      currentRevisionId: id(99),
    });
    await expect(
      service.resolve(id(1), id(8), {
        expectedSourceRevisionId: id(3),
        resolutions: [
          { clarificationId: id(4), expectedVersion: 1, action: 'leave_open' },
        ],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.clarification.update).not.toHaveBeenCalled();

    prisma.projectSource.findUnique.mockResolvedValue({
      id: id(2),
      currentRevisionId: id(3),
    });
    prisma.clarification.findMany.mockResolvedValue([
      { id: id(4), status: 'open', version: 2, items: [] },
    ]);
    await expect(
      service.resolve(id(1), id(8), {
        expectedSourceRevisionId: id(3),
        resolutions: [
          { clarificationId: id(4), expectedVersion: 1, action: 'leave_open' },
        ],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.clarification.update).not.toHaveBeenCalled();
  });

  it('rejects missing source, duplicate requests, and non-current clarification states', async () => {
    prisma.projectSource.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.resolve(id(1), id(8), {
        expectedSourceRevisionId: id(3),
        resolutions: [],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.projectSource.findUnique.mockResolvedValue({
      id: id(2),
      currentRevisionId: id(3),
    });
    await expect(
      service.resolve(id(1), id(8), {
        expectedSourceRevisionId: id(3),
        resolutions: [
          { clarificationId: id(4), expectedVersion: 1, action: 'leave_open' },
          { clarificationId: id(4), expectedVersion: 1, action: 'leave_open' },
        ],
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    prisma.clarification.findMany.mockResolvedValue([
      { id: id(4), status: 'answered', version: 1, items: [] },
    ]);
    await expect(
      service.resolve(id(1), id(8), {
        expectedSourceRevisionId: id(3),
        resolutions: [
          { clarificationId: id(4), expectedVersion: 1, action: 'leave_open' },
        ],
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    prisma.clarification.findMany.mockResolvedValue([]);
    await expect(
      service.resolve(id(1), id(8), {
        expectedSourceRevisionId: id(3),
        resolutions: [
          { clarificationId: id(4), expectedVersion: 1, action: 'leave_open' },
        ],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not create a source revision when every point is deliberately left open', async () => {
    prisma.projectSource.findUnique.mockResolvedValue({
      id: id(2),
      currentRevisionId: id(3),
    });
    prisma.clarification.findMany.mockResolvedValue([
      { id: id(4), status: 'left_open', version: 2, items: [] },
    ]);
    const result = await service.resolve(id(1), id(8), {
      expectedSourceRevisionId: id(3),
      resolutions: [
        { clarificationId: id(4), expectedVersion: 2, action: 'leave_open' },
      ],
    });
    expect(result.sourceRevisionId).toBeNull();
    expect(revisions.commitClarificationAnswers).not.toHaveBeenCalled();
    expect(prisma.clarification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'left_open', version: { increment: 1 } },
      }),
    );
  });

  it('rejects a stale source revision commit before updating clarification state', async () => {
    prisma.projectSource.findUnique.mockResolvedValue({
      id: id(2),
      currentRevisionId: id(3),
    });
    prisma.clarification.findMany.mockResolvedValue([
      {
        id: id(4),
        status: 'open',
        version: 1,
        items: [{ informationItemId: id(5) }],
      },
    ]);
    prisma.contributorAssertion.create.mockResolvedValue({ id: id(9) });
    revisions.commitClarificationAnswers.mockResolvedValue({ status: 'stale' });
    await expect(
      service.resolve(id(1), id(8), {
        expectedSourceRevisionId: id(3),
        resolutions: [
          {
            clarificationId: id(4),
            expectedVersion: 1,
            action: 'answer',
            answer: 'Confirmed',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.clarification.update).not.toHaveBeenCalled();
  });
});
