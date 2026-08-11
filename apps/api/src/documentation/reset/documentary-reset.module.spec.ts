import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { DocumentStorageClient } from '../source/document-storage.client';
import { asPrismaService, createPrismaMock } from '../../test/prisma-mock';
import { DocumentaryResetCommand } from './documentary-reset.command';
import { DocumentaryResetModule } from './documentary-reset.module';
import { DocumentaryResetService } from './documentary-reset.service';
import { DocumentaryTransitionService } from './documentary-transition.service';

describe('DocumentaryResetModule', () => {
  it('resolves the transition, reset, and CLI providers without an HTTP app', async () => {
    const module = await Test.createTestingModule({
      imports: [DocumentaryResetModule],
    })
      .overrideProvider(PrismaService)
      .useValue(asPrismaService(createPrismaMock()))
      .overrideProvider(DocumentStorageClient)
      .useValue({ delete: jest.fn() })
      .compile();

    expect(module.get(DocumentaryTransitionService)).toBeDefined();
    expect(module.get(DocumentaryResetService)).toBeDefined();
    expect(module.get(DocumentaryResetCommand)).toBeDefined();

    await module.close();
  });
});
