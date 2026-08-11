import {
  Body,
  Controller,
  Get,
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
  ) {
    return this.documents.addUpload(user.id, projectId, file);
  }

  @Post('notion')
  addNotion(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Body() body: CreateNotionSourceDocumentDto,
  ) {
    return this.documents.addNotion(user.id, projectId, body.pageUrl);
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

  @Post(':documentId/processing/cancel')
  @HttpCode(202)
  cancelProcessing(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.documents.cancelProcessing(user.id, projectId, documentId);
  }

  @Post(':documentId/retry-processing')
  @HttpCode(202)
  retryProcessing(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.documents.retryProcessing(user.id, projectId, documentId);
  }

  @Post(':documentId/removal')
  @HttpCode(202)
  confirmRemoval(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Body() body: ConfirmSourceDocumentRemovalDto,
  ) {
    return this.removal.confirm(user.id, projectId, documentId, body);
  }

  @Post(':documentId/removal/retry')
  @HttpCode(202)
  retryRemoval(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.removal.retry(user.id, projectId, documentId);
  }
}
