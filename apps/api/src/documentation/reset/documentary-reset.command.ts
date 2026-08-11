import { BadRequestException, Injectable } from '@nestjs/common';
import {
  DOCUMENTARY_RESET_FEATURE_KEY,
  DocumentaryResetReport,
  DocumentaryResetService,
} from './documentary-reset.service';

@Injectable()
export class DocumentaryResetCommand {
  constructor(private readonly reset: DocumentaryResetService) {}

  async execute(argv: readonly string[]): Promise<DocumentaryResetReport> {
    const dryRun = argv.includes('--dry-run');
    const confirmIndex = argv.indexOf('--confirm');
    const confirm = confirmIndex >= 0;
    if (dryRun === confirm) {
      throw new BadRequestException(
        'Select exactly one mode: dry-run or confirm.',
      );
    }

    if (dryRun) {
      const feature = this.valueAfter(argv, '--feature');
      this.assertFeature(feature);
      return this.reset.dryRun(feature);
    }

    const feature = argv[confirmIndex + 1];
    this.assertFeature(feature);
    const digest = this.valueAfter(argv, '--digest');
    if (!/^[a-f0-9]{64}$/.test(digest)) {
      throw new BadRequestException(
        'Confirmation requires the exact 64-character dry-run digest.',
      );
    }
    return this.reset.confirm(feature, digest);
  }

  private valueAfter(argv: readonly string[], flag: string): string {
    const index = argv.indexOf(flag);
    const value = index >= 0 ? argv[index + 1] : undefined;
    if (!value || value.startsWith('--')) {
      throw new BadRequestException(`Missing value for ${flag}.`);
    }
    return value;
  }

  private assertFeature(feature: string): void {
    if (feature !== DOCUMENTARY_RESET_FEATURE_KEY) {
      throw new BadRequestException('Unsupported documentary reset feature.');
    }
  }
}
