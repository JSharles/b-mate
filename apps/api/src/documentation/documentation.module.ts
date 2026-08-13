import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GenerationModule } from '../generation/generation.module';
import { NotionConnectionModule } from '../notion-connection/notion-connection.module';
import { ProjectsModule } from '../projects/projects.module';
import { ImageNormalizer } from './source/image-normalizer';
import { DocumentInputNormalizerService } from './source/document-input-normalizer.service';
import { DocumentStorageClient } from './source/document-storage.client';
import { SourceDocumentService } from './source/source-document.service';
import { SourceDocumentsController } from './controllers/source-documents.controller';
import { SectionsController } from './controllers/sections.controller';
import { ReferenceDocumentController } from './controllers/reference-document.controller';
import { ReferenceDocumentHandler } from './reference/reference-document.handler';
import { ReferenceDocumentService } from './reference/reference-document.service';
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
    ClientContentController,
    DocumentationWorkspaceController,
    DocumentationOperationsController,
    SectionsController,
    ReferenceDocumentController,
  ],
  providers: [
    ImageNormalizer,
    DocumentInputNormalizerService,
    DocumentStorageClient,
    SourceDocumentService,
    ClientDerivationHandler,
    ClientPublicationService,
    DocumentationWorkspaceService,
    DocumentRemovalService,
    ClientSectionService,
    SectionCompositionHandler,
    SectionProposalService,
    ReferenceDocumentHandler,
    ReferenceDocumentService,
  ],
  exports: [SourceDocumentService],
})
export class DocumentationModule {}
