import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  asPrismaService,
  createPrismaMock,
  PrismaMock,
} from '../../test/prisma-mock';
import {
  DOCUMENTARY_TRANSITION_STATE_ID,
  DocumentaryTransitionBlockedError,
  DocumentaryTransitionService,
  DocumentaryTransitionUnavailableError,
} from './documentary-transition.service';

type TransitionDelegate = {
  findUnique: jest.Mock;
  update: jest.Mock;
};

function addTransitionDelegate(prisma: PrismaMock): TransitionDelegate {
  const delegate = {
    findUnique: jest.fn(),
    update: jest.fn(),
  };
  Object.assign(prisma, { documentaryTransitionState: delegate });
  return delegate;
}

const legacyState = {
  id: DOCUMENTARY_TRANSITION_STATE_ID,
  mode: 'legacy',
  version: 1,
  activeResetRunId: null,
  approvedInventoryDigest: null,
  writeFreezeAt: null,
  canonicalizedAt: null,
  createdAt: new Date('2026-08-11T00:00:00.000Z'),
  updatedAt: new Date('2026-08-11T00:00:00.000Z'),
};

describe('DocumentaryTransitionService', () => {
  let prisma: PrismaMock;
  let transition: TransitionDelegate;
  let service: DocumentaryTransitionService;

  beforeEach(() => {
    prisma = createPrismaMock();
    transition = addTransitionDelegate(prisma);
    transition.findUnique.mockResolvedValue(legacyState);
    service = new DocumentaryTransitionService(asPrismaService(prisma));
  });

  it('fails closed when the singleton row is absent', async () => {
    transition.findUnique.mockResolvedValue(null);

    await expect(service.getRequiredState()).rejects.toBeInstanceOf(
      DocumentaryTransitionUnavailableError,
    );
  });

  it.each(['resetting', 'canonical'] as const)(
    'rejects legacy writes while transition mode is %s',
    async (mode) => {
      transition.findUnique.mockResolvedValue({ ...legacyState, mode });
      const mutation = jest.fn();

      await expect(
        service.withLegacyMutation('legacy-upload', mutation),
      ).rejects.toBeInstanceOf(DocumentaryTransitionBlockedError);
      expect(mutation).not.toHaveBeenCalled();
    },
  );

  it('holds the shared advisory lock for the complete legacy mutation', async () => {
    const mutation = jest.fn().mockResolvedValue('created');

    await expect(
      service.withLegacyMutation('legacy-upload', mutation),
    ).resolves.toBe('created');

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const sharedLockCalls = prisma.$queryRaw.mock.calls as unknown[][];
    expect(String(sharedLockCalls[0]?.[0])).toContain(
      'SELECT TRUE AS "locked"',
    );
    expect(mutation).toHaveBeenCalledTimes(1);
  });

  it('runs compensation when a guarded mutation fails after an external write', async () => {
    const compensation = jest.fn().mockResolvedValue(undefined);

    await expect(
      service.withLegacyMutation(
        'legacy-upload',
        () => Promise.reject(new Error('database commit failed')),
        compensation,
      ),
    ).rejects.toThrow('database commit failed');

    expect(compensation).toHaveBeenCalledTimes(1);
  });

  it('takes the exclusive lock, validates the approved digest, and freezes legacy writes', async () => {
    transition.update.mockResolvedValue({
      ...legacyState,
      mode: 'resetting',
      approvedInventoryDigest: 'digest-a',
    });

    await service.beginReset({
      runId: '00000000-0000-4000-8000-000000000001',
      approvedDigest: 'digest-a',
      currentDigest: 'digest-a',
    });

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const exclusiveLockCalls = prisma.$queryRaw.mock.calls as unknown[][];
    expect(String(exclusiveLockCalls[0]?.[0])).toContain(
      'SELECT TRUE AS "locked"',
    );
    const beginCalls = transition.update.mock.calls as unknown[][];
    const beginUpdate = beginCalls[0]?.[0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(beginUpdate.where).toEqual({
      id: DOCUMENTARY_TRANSITION_STATE_ID,
    });
    expect(beginUpdate.data).toMatchObject({
      mode: 'resetting',
      approvedInventoryDigest: 'digest-a',
      activeResetRunId: '00000000-0000-4000-8000-000000000001',
    });
  });

  it('rejects inventory drift before changing the transition mode', async () => {
    await expect(
      service.beginReset({
        runId: '00000000-0000-4000-8000-000000000001',
        approvedDigest: 'digest-a',
        currentDigest: 'digest-b',
      }),
    ).rejects.toThrow('inventory');

    expect(transition.update).not.toHaveBeenCalled();
  });

  it('moves to canonical only for the active reset run', async () => {
    transition.findUnique.mockResolvedValue({
      ...legacyState,
      mode: 'resetting',
      activeResetRunId: '00000000-0000-4000-8000-000000000001',
    });

    await service.completeReset('00000000-0000-4000-8000-000000000001');

    const completeCalls = transition.update.mock.calls as unknown[][];
    const completeUpdate = completeCalls[0]?.[0] as {
      where: { id: string };
      data: {
        mode: string;
        activeResetRunId: string | null;
        canonicalizedAt: Date;
      };
    };
    expect(completeUpdate.where).toEqual({
      id: DOCUMENTARY_TRANSITION_STATE_ID,
    });
    expect(completeUpdate.data.mode).toBe('canonical');
    expect(completeUpdate.data.activeResetRunId).toBeNull();
    expect(completeUpdate.data.canonicalizedAt).toBeInstanceOf(Date);
  });
});

describe('documentary transition migration', () => {
  it('seeds exactly one fixed legacy singleton idempotently', async () => {
    const migration = await readFile(
      join(
        __dirname,
        '../../../prisma/migrations/20260811100000_add_documentary_reset_manifest/migration.sql',
      ),
      'utf8',
    );

    expect(migration).toContain("'documentary-transition'");
    expect(migration).toMatch(
      /CHECK\s*\(\s*"id"\s*=\s*'documentary-transition'/i,
    );
    expect(migration).toMatch(/INSERT INTO "documentary_transition_states"/i);
    expect(migration).toMatch(/ON CONFLICT\s*\("id"\)\s*DO NOTHING/i);
    expect(migration).toMatch(/'legacy'/i);
  });
});
