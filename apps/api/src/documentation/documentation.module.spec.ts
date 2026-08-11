import { MODULE_METADATA } from '@nestjs/common/constants';
import { AuthModule } from '../auth/auth.module';
import { DocumentationModule } from './documentation.module';

describe('DocumentationModule', () => {
  it('imports authentication for its session-protected controllers', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      DocumentationModule,
    ) as unknown[];

    expect(imports).toContain(AuthModule);
  });
});
