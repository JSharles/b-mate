import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../auth/current-user.decorator';
import { SessionGuard } from '../../auth/session.guard';
import {
  ConfirmSourceDocumentRemovalDto,
  CreateNotionSourceDocumentDto,
} from '../dto/source-document.dto';
import { DocumentRemovalService } from '../source/document-removal.service';
import { SourceDocumentService } from '../source/source-document.service';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

@Controller('projects/:projectId/documentation/documents')
@UseGuards(SessionGuard)
export class SourceDocumentsController {
  constructor(
    private readonly documents: SourceDocumentService,
    private readonly removal: DocumentRemovalService,
  ) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE_BYTES } }),
  )
  upload(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @UploadedFile() file: Express.Multer.File,
    // Adding a document writes the reference document, so the language the
    // request arrived in has to travel with it: a first upload should already
    // produce a document in the developer's language.
    @Headers('x-interface-locale') headerLocale?: string,
  ) {
    return this.documents.addUpload(
      user.id,
      projectId,
      file,
      headerLocale ?? user.locale ?? null,
    );
  }

  @Post('notion')
  addNotion(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Body() body: CreateNotionSourceDocumentDto,
    @Headers('x-interface-locale') headerLocale?: string,
  ) {
    return this.documents.addNotion(
      user.id,
      projectId,
      body.pageUrl,
      headerLocale ?? user.locale ?? null,
    );
  }

  @Get()
  list(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.documents.list(user.id, projectId, cursor);
  }

  @Get(':documentId')
  detail(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.documents.detail(user.id, projectId, documentId);
  }

  @Get(':documentId/removal-preview')
  removalPreview(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.removal.preview(user.id, projectId, documentId);
  }

  @Post(':documentId/removal')
  @HttpCode(202)
  confirmRemoval(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Body() body: ConfirmSourceDocumentRemovalDto,
    @Headers('x-interface-locale') headerLocale?: string,
  ) {
    return this.removal.confirm(
      user.id,
      projectId,
      documentId,
      body,
      headerLocale ?? user.locale ?? null,
    );
  }
}
