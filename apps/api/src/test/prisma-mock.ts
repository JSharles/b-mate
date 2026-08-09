import type { PrismaService } from '../prisma/prisma.service';

export type PrismaMock = {
  user: {
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  session: {
    create: jest.Mock;
    deleteMany: jest.Mock;
    findUnique: jest.Mock;
  };
  project: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    update: jest.Mock;
  };
  projectMember: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    delete: jest.Mock;
  };
  invitation: {
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  boardConnection: {
    upsert: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    deleteMany: jest.Mock;
    update: jest.Mock;
  };
  vulgarizedTask: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    upsert: jest.Mock;
    deleteMany: jest.Mock;
  };
  taskProgress: {
    findUnique: jest.Mock;
    upsert: jest.Mock;
    deleteMany: jest.Mock;
  };
  resource: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  resourceVulgarization: {
    upsert: jest.Mock;
    findUnique: jest.Mock;
  };
  resourceCategory: {
    upsert: jest.Mock;
    findMany: jest.Mock;
  };
  resourceCategoryAssignment: {
    upsert: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
  };
  notionConnection: {
    findUnique: jest.Mock;
    upsert: jest.Mock;
    delete: jest.Mock;
    deleteMany: jest.Mock;
  };
  $queryRaw: jest.Mock;
  $transaction: jest.Mock;
};

export function createPrismaMock(): PrismaMock {
  const mock: PrismaMock = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    session: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      findUnique: jest.fn(),
    },
    project: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    projectMember: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
    invitation: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    boardConnection: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      update: jest.fn(),
    },
    vulgarizedTask: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    taskProgress: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    resource: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    resourceVulgarization: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
    resourceCategory: {
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    resourceCategoryAssignment: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    notionConnection: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
    // Runs the callback with this same mock standing in for the transaction
    // client, so tests can assert on `prisma.project.create` etc. directly.
    $transaction: jest.fn((callback: (tx: PrismaMock) => unknown) =>
      callback(mock),
    ),
  };

  return mock;
}

export function asPrismaService(mock: PrismaMock): PrismaService {
  return mock as unknown as PrismaService;
}
