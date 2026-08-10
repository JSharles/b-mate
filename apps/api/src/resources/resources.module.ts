import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotionConnectionModule } from '../notion-connection/notion-connection.module';
import { CategoriesController } from './categories.controller';
import { CategoryContentService } from './category-content.service';
import { CategoryReferenceService } from './category-reference.service';
import { ReferenceAnalysisClient } from './reference-analysis.client';
import { ImageNormalizer } from './image-normalizer';
import { ResourceBatchSweepService } from './resource-batch-sweep.service';
import { ResourceStorageClient } from './resource-storage.client';
import { ResourcesController } from './resources.controller';
import { ResourcesService } from './resources.service';

@Module({
  imports: [AuthModule, NotionConnectionModule],
  controllers: [ResourcesController, CategoriesController],
  providers: [
    ResourcesService,
    CategoryReferenceService,
    CategoryContentService,
    ResourceStorageClient,
    ReferenceAnalysisClient,
    ImageNormalizer,
    ResourceBatchSweepService,
  ],
})
export class ResourcesModule {}
