import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotionConnectionController } from './notion-connection.controller';
import { NotionConnectionService } from './notion-connection.service';
import { NotionClient } from './notion.client';

@Module({
  imports: [AuthModule],
  controllers: [NotionConnectionController],
  providers: [NotionConnectionService, NotionClient],
  exports: [NotionConnectionService, NotionClient],
})
export class NotionConnectionModule {}
