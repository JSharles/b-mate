import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GenerationModule } from '../generation/generation.module';
import { NotionConnectionModule } from '../notion-connection/notion-connection.module';
import { ProjectsModule } from '../projects/projects.module';
import { ImageNormalizer } from './source/image-normalizer';
import { DocumentExtractionHandler } from './source/document-extraction.handler';
import { DocumentInputNormalizerService } from './source/document-input-normalizer.service';
import { DocumentStorageClient } from './source/document-storage.client';
import { SourceConsolidationHandler } from './source/source-consolidation.handler';
import { SourceDocumentService } from './source/source-document.service';
import { SourceRevisionService } from './source/source-revision.service';
import { SourceDocumentsController } from './controllers/source-documents.controller';
import { CanonicalSourceController } from './controllers/canonical-source.controller';
import { SourceCorrectionService } from './source/source-correction.service';
import { ClarificationService } from './source/clarification.service';
import { ClarificationsController } from './controllers/clarifications.controller';
import { SectionsController } from './controllers/sections.controller';
import { ClientSectionService } from './sections/client-section.service';
import { SectionCompositionHandler } from './composition/section-composition.handler';
import { SectionProposalService } from './composition/section-proposal.service';
import { ClientContentController } from './controllers/client-content.controller';
import { ClientPublicationService } from './publication/client-publication.service';
import { ClientDerivationHandler } from './publication/client-derivation.handler';
import { DocumentationWorkspaceController } from './controllers/documentation-workspace.controller';
import { DocumentationWorkspaceService } from './workspace/documentation-workspace.service';
import { DocumentRemovalService } from './source/document-removal.service';
import { DocumentationOperationsController } from './controllers/documentation-operations.controller';

@Module({
  imports: [
    AuthModule,
    GenerationModule,
    NotionConnectionModule,
    ProjectsModule,
  ],
  controllers: [
    SourceDocumentsController,
    CanonicalSourceController,
    ClarificationsController,
    ClientContentController,
    DocumentationWorkspaceController,
    DocumentationOperationsController,
    SectionsController,
  ],
  providers: [
    ImageNormalizer,
    DocumentInputNormalizerService,
    DocumentStorageClient,
    SourceDocumentService,
    SourceRevisionService,
    SourceCorrectionService,
    ClarificationService,
    DocumentExtractionHandler,
    SourceConsolidationHandler,
    ClientDerivationHandler,
    ClientPublicationService,
    DocumentationWorkspaceService,
    DocumentRemovalService,
    ClientSectionService,
    SectionCompositionHandler,
    SectionProposalService,
  ],
  exports: [SourceDocumentService, SourceRevisionService],
})
export class DocumentationModule {}
