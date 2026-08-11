import { NestFactory } from '@nestjs/core';
import { DocumentaryResetCommand } from './documentary-reset.command';
import { DocumentaryResetModule } from './documentary-reset.module';

export async function bootstrapDocumentaryReset(
  argv: readonly string[] = process.argv.slice(2),
  write: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
): Promise<void> {
  const context = await NestFactory.createApplicationContext(
    DocumentaryResetModule,
    { logger: ['error', 'warn'] },
  );

  try {
    const report = await context.get(DocumentaryResetCommand).execute(argv);
    write(JSON.stringify(report));
  } finally {
    await context.close();
  }
}

if (require.main === module) {
  void bootstrapDocumentaryReset().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${JSON.stringify({ status: 'failed', message })}\n`);
    process.exitCode = 1;
  });
}
