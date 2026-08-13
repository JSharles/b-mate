import type { PrismaService } from '../prisma/prisma.service';

const DELEGATE_METHODS = [
  'aggregate',
  'count',
  'create',
  'createMany',
  'delete',
  'deleteMany',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'update',
  'updateMany',
  'upsert',
] as const;

export type PrismaDelegateMock = Record<
  (typeof DELEGATE_METHODS)[number],
  jest.Mock
>;

const DELEGATE_NAMES = [
  'user',
  'session',
  'project',
  'projectMember',
  'invitation',
  'task',
  'boardConnection',
  'vulgarizedTask',
  'taskProgress',
  'notionConnection',
  // Canonical source and provenance delegates.
  'projectSource',
  'sourceRevision',
  'informationItem',
  'sourceRevisionItem',
  'sourceRevisionChange',
  'sourceDocument',
  'documentObservation',
  'contributorAssertion',
  'provenanceLink',
  'clarification',
  'clarificationItem',
  'clarificationEvidence',
  'clarificationResolution',
  // Author-defined client sections and their composition.
  'referenceDocument',
  'clientSection',
  'sectionProposal',
  'sectionQuestion',
  'sectionQuestionItem',
  // Publication delegates.
  'clientSectionContent',
  'clientContentRelease',
  'clientContentReleaseEntry',
  'projectClientPublication',
  // Durable generation delegates.
  'generationOperation',
  'generationAttempt',
] as const;

type DelegateName = (typeof DELEGATE_NAMES)[number];

export type PrismaMock = Record<DelegateName, PrismaDelegateMock> & {
  $executeRaw: jest.Mock;
  $executeRawUnsafe: jest.Mock;
  $queryRaw: jest.Mock;
  $queryRawUnsafe: jest.Mock;
  $transaction: jest.Mock;
};

function createDelegateMock(): PrismaDelegateMock {
  return Object.fromEntries(
    DELEGATE_METHODS.map((method) => [method, jest.fn()]),
  ) as PrismaDelegateMock;
}

export function createPrismaMock(): PrismaMock {
  const delegates = Object.fromEntries(
    DELEGATE_NAMES.map((name) => [name, createDelegateMock()]),
  ) as Record<DelegateName, PrismaDelegateMock>;

  const mock = {
    ...delegates,
    $executeRaw: jest.fn(),
    $executeRawUnsafe: jest.fn(),
    $queryRaw: jest.fn(),
    $queryRawUnsafe: jest.fn(),
    $transaction: jest.fn(),
  } as PrismaMock;

  // Interactive transactions receive the same fully populated mock. Array
  // transactions preserve Prisma's ordered Promise.all-style result shape.
  mock.$transaction.mockImplementation(
    (input: ((tx: PrismaMock) => unknown) | readonly unknown[]) =>
      typeof input === 'function' ? input(mock) : Promise.all(input),
  );

  return mock;
}

export function asPrismaService(mock: PrismaMock): PrismaService {
  return mock as unknown as PrismaService;
}
