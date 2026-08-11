import { Injectable } from '@nestjs/common';
import type {
  GenerationOperation,
  GenerationOperationType,
  Prisma,
} from '@prisma/client';
import type {
  GenerationProviderRequest,
  GenerationProviderResult,
} from './adapters/generation-provider';

export type GenerationRequestInput = Omit<
  GenerationProviderRequest,
  'operationId' | 'attemptId' | 'model' | 'transport' | 'correlationId'
>;

export interface GenerationHandler {
  readonly type: GenerationOperationType;
  buildRequest(operation: GenerationOperation): Promise<GenerationRequestInput>;
  apply(
    tx: Prisma.TransactionClient,
    operation: GenerationOperation,
    result: GenerationProviderResult,
  ): Promise<void>;
  onTerminalFailure?(
    tx: Prisma.TransactionClient,
    operation: GenerationOperation,
    failureCode: string,
  ): Promise<void>;
}

@Injectable()
export class GenerationHandlerRegistry {
  private readonly handlers = new Map<
    GenerationOperationType,
    GenerationHandler
  >();

  register(handler: GenerationHandler): void {
    if (this.handlers.has(handler.type)) {
      throw new Error(
        `Generation handler ${handler.type} is already registered.`,
      );
    }
    this.handlers.set(handler.type, handler);
  }

  get(type: GenerationOperationType): GenerationHandler {
    const handler = this.handlers.get(type);
    if (!handler) {
      throw new Error(`No generation handler registered for ${type}.`);
    }
    return handler;
  }
}
