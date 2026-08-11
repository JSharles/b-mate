import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  DocumentaryTransitionMode,
  DocumentaryTransitionState,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export const DOCUMENTARY_TRANSITION_STATE_ID = 'documentary-transition';

const DOCUMENTARY_TRANSITION_LOCK_KEY = 'diaphane:documentary-transition:016';

type TransitionReader = Pick<
  Prisma.TransactionClient,
  'documentaryTransitionState'
>;

export class DocumentaryTransitionUnavailableError extends ServiceUnavailableException {
  constructor() {
    super({
      code: 'DOCUMENTARY_TRANSITION_UNAVAILABLE',
      message: 'The documentary transition state is unavailable.',
    });
  }
}

export class DocumentaryTransitionBlockedError extends ServiceUnavailableException {
  constructor(mode: DocumentaryTransitionMode) {
    super({
      code: 'DOCUMENTARY_TRANSITION_BLOCKED',
      mode,
      message: 'The legacy documentary workflow is not writable.',
    });
  }
}

@Injectable()
export class DocumentaryTransitionService {
  constructor(private readonly prisma: PrismaService) {}

  async getRequiredState(
    client: TransitionReader = this.prisma,
  ): Promise<DocumentaryTransitionState> {
    const state = await client.documentaryTransitionState.findUnique({
      where: { id: DOCUMENTARY_TRANSITION_STATE_ID },
    });
    if (!state) {
      throw new DocumentaryTransitionUnavailableError();
    }
    return state;
  }

  async withLegacyMutation<T>(
    operation: string,
    mutation: () => Promise<T>,
    compensate?: () => Promise<void>,
  ): Promise<T> {
    let mutationStarted = false;

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw<{ locked: boolean }[]>`
            SELECT TRUE AS "locked"
            FROM (
              SELECT pg_advisory_xact_lock_shared(
                hashtext(${DOCUMENTARY_TRANSITION_LOCK_KEY})
              )
            ) AS "acquired_lock"
          `;
          const state = await this.getRequiredState(tx);
          if (state.mode !== 'legacy') {
            throw new DocumentaryTransitionBlockedError(state.mode);
          }

          mutationStarted = true;
          return mutation();
        },
        {
          isolationLevel: 'ReadCommitted',
          maxWait: 10_000,
          timeout: 120_000,
        },
      );
    } catch (error) {
      if (mutationStarted && compensate) {
        try {
          await compensate();
        } catch (compensationError) {
          throw new AggregateError(
            [error, compensationError],
            `Legacy documentary mutation ${operation} and its compensation both failed.`,
          );
        }
      }
      throw error;
    }
  }

  async beginReset(input: {
    runId: string;
    approvedDigest: string;
    currentDigest: string;
  }): Promise<void> {
    if (input.approvedDigest !== input.currentDigest) {
      throw new ConflictException({
        code: 'DOCUMENTARY_RESET_INVENTORY_DRIFT',
        message: 'The documentary inventory changed after approval.',
      });
    }

    await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT TRUE AS "locked"
          FROM (
            SELECT pg_advisory_xact_lock(
              hashtext(${DOCUMENTARY_TRANSITION_LOCK_KEY})
            )
          ) AS "acquired_lock"
        `;
        const state = await this.getRequiredState(tx);

        if (state.mode === 'canonical') {
          throw new DocumentaryTransitionBlockedError(state.mode);
        }
        if (
          state.mode === 'resetting' &&
          state.activeResetRunId !== null &&
          state.activeResetRunId !== input.runId
        ) {
          throw new ConflictException({
            code: 'DOCUMENTARY_RESET_ALREADY_ACTIVE',
            message: 'Another documentary reset run is active.',
          });
        }
        if (
          state.mode === 'resetting' &&
          state.approvedInventoryDigest !== input.approvedDigest
        ) {
          throw new ConflictException({
            code: 'DOCUMENTARY_RESET_DIGEST_MISMATCH',
            message: 'The active reset uses another approved inventory.',
          });
        }

        await tx.documentaryTransitionState.update({
          where: { id: DOCUMENTARY_TRANSITION_STATE_ID },
          data: {
            mode: 'resetting',
            version: { increment: 1 },
            activeResetRunId: input.runId,
            approvedInventoryDigest: input.approvedDigest,
            writeFreezeAt: state.writeFreezeAt ?? new Date(),
          },
        });
      },
      { isolationLevel: 'Serializable', maxWait: 30_000, timeout: 30_000 },
    );
  }

  async completeReset(runId: string): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT TRUE AS "locked"
          FROM (
            SELECT pg_advisory_xact_lock(
              hashtext(${DOCUMENTARY_TRANSITION_LOCK_KEY})
            )
          ) AS "acquired_lock"
        `;
        const state = await this.getRequiredState(tx);
        if (state.mode !== 'resetting' || state.activeResetRunId !== runId) {
          throw new ConflictException({
            code: 'DOCUMENTARY_RESET_NOT_ACTIVE',
            message: 'The reset run is not the active frozen transition.',
          });
        }

        await tx.documentaryTransitionState.update({
          where: { id: DOCUMENTARY_TRANSITION_STATE_ID },
          data: {
            mode: 'canonical',
            version: { increment: 1 },
            activeResetRunId: null,
            canonicalizedAt: new Date(),
          },
        });
      },
      { isolationLevel: 'Serializable', maxWait: 30_000, timeout: 30_000 },
    );
  }
}
