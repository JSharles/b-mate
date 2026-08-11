import { DocumentaryResetService } from './documentary-reset.service';
import { DocumentaryResetCommand } from './documentary-reset.command';

describe('DocumentaryResetCommand', () => {
  let reset: jest.Mocked<Pick<DocumentaryResetService, 'dryRun' | 'confirm'>>;
  let command: DocumentaryResetCommand;

  beforeEach(() => {
    reset = {
      dryRun: jest.fn(),
      confirm: jest.fn(),
    };
    command = new DocumentaryResetCommand(
      reset as unknown as DocumentaryResetService,
    );
  });

  it('executes a read-only dry-run for the explicit feature key', async () => {
    reset.dryRun.mockResolvedValue({
      featureKey: '016-canonical-document-workflow',
      status: 'inventoried',
      digest: 'a'.repeat(64),
      resources: [],
      counts: {},
    });

    await command.execute([
      '--dry-run',
      '--feature',
      '016-canonical-document-workflow',
    ]);

    expect(reset.dryRun).toHaveBeenCalledWith(
      '016-canonical-document-workflow',
    );
    expect(reset.confirm).not.toHaveBeenCalled();
  });

  it('requires the exact approved digest for confirmation', async () => {
    await expect(
      command.execute([
        '--confirm',
        '016-canonical-document-workflow',
        '--digest',
        'not-a-digest',
      ]),
    ).rejects.toThrow('digest');

    expect(reset.confirm).not.toHaveBeenCalled();
  });

  it('passes a valid approved digest to the confirmed runner', async () => {
    const digest = 'b'.repeat(64);
    reset.confirm.mockResolvedValue({
      featureKey: '016-canonical-document-workflow',
      status: 'clean',
      digest,
      resources: [],
      counts: {},
    });

    await command.execute([
      '--confirm',
      '016-canonical-document-workflow',
      '--digest',
      digest,
    ]);

    expect(reset.confirm).toHaveBeenCalledWith(
      '016-canonical-document-workflow',
      digest,
    );
  });

  it('rejects an unsupported feature key and ambiguous modes', async () => {
    await expect(
      command.execute(['--dry-run', '--feature', 'other-feature']),
    ).rejects.toThrow('feature');
    await expect(
      command.execute([
        '--dry-run',
        '--confirm',
        '016-canonical-document-workflow',
      ]),
    ).rejects.toThrow('one mode');
  });
});
