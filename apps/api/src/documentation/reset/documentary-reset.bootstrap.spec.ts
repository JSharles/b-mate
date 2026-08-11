import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentaryResetCommand } from './documentary-reset.command';
import { bootstrapDocumentaryReset } from './documentary-reset.bootstrap';

describe('bootstrapDocumentaryReset', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses an application context, writes one report, and always closes', async () => {
    const execute = jest.fn().mockResolvedValue({
      featureKey: '016-canonical-document-workflow',
      status: 'inventoried',
      digest: 'a'.repeat(64),
      resources: [],
      counts: {},
    });
    const close = jest.fn().mockResolvedValue(undefined);
    const get = jest.fn().mockReturnValue({ execute });
    const context = {
      get,
      close,
    } as unknown as INestApplicationContext;
    jest
      .spyOn(NestFactory, 'createApplicationContext')
      .mockResolvedValue(context);
    const write = jest.fn();

    await bootstrapDocumentaryReset(
      ['--dry-run', '--feature', '016-canonical-document-workflow'],
      write,
    );

    expect(get).toHaveBeenCalledWith(DocumentaryResetCommand);
    expect(write).toHaveBeenCalledWith(expect.stringContaining('inventoried'));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('closes the context when command execution fails', async () => {
    const close = jest.fn().mockResolvedValue(undefined);
    const context = {
      get: jest.fn().mockReturnValue({
        execute: jest.fn().mockRejectedValue(new Error('reset failed')),
      }),
      close,
    } as unknown as INestApplicationContext;
    jest
      .spyOn(NestFactory, 'createApplicationContext')
      .mockResolvedValue(context);

    await expect(
      bootstrapDocumentaryReset([
        '--dry-run',
        '--feature',
        '016-canonical-document-workflow',
      ]),
    ).rejects.toThrow('reset failed');
    expect(close).toHaveBeenCalledTimes(1);
  });
});
