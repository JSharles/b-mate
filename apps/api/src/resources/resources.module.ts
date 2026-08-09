import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotionConnectionModule } from '../notion-connection/notion-connection.module';
import { DocumentVulgarizationClient } from './document-vulgarization.client';
import { ResourceBatchSweepService } from './resource-batch-sweep.service';
import { ResourceStorageClient } from './resource-storage.client';
import { ResourcesController } from './resources.controller';
import { ResourcesService } from './resources.service';

@Module({
  imports: [AuthModule, NotionConnectionModule],
  controllers: [ResourcesController],
  providers: [
    ResourcesService,
    ResourceStorageClient,
    DocumentVulgarizationClient,
    ResourceBatchSweepService,
  ],
})
export class ResourcesModule {}
