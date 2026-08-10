import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionGuard } from '../auth/session.guard';
import { parseLocale } from '../task-vulgarization/locale';
import { CreateResourceNotionDto } from './dto/create-resource-notion.dto';
import { MoveResourceSectionDto } from './dto/move-resource-section.dto';
import { ResourcesService } from './resources.service';

// 25 MB (spec.md FR-013) — an early, HTTP-layer rejection so an oversized
// upload never reaches ResourcesService; the service re-validates size and
// MIME type itself regardless (defense in depth, and what's actually unit
// tested — see resources.service.spec.ts).
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

@Controller('projects/:projectId/resources')
@UseGuards(SessionGuard)
export class ResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE_BYTES } }),
  )
  upload(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.resourcesService.createFromUpload(user.id, projectId, file);
  }

  @Post('notion')
  connectNotion(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Body() body: CreateResourceNotionDto,
  ) {
    return this.resourcesService.createFromNotion(
      user.id,
      projectId,
      body.pageUrl,
    );
  }

  @Get()
  findAll(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Query('locale') locale: string | undefined,
  ) {
    return this.resourcesService.findAllForProject(
      user.id,
      projectId,
      parseLocale(locale),
    );
  }

  @Get(':resourceId')
  findOne(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('resourceId') resourceId: string,
    @Query('locale') locale: string | undefined,
  ) {
    return this.resourcesService.findOne(
      user.id,
      projectId,
      resourceId,
      parseLocale(locale),
    );
  }

  @Post(':resourceId/publish')
  publish(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('resourceId') resourceId: string,
  ) {
    return this.resourcesService.publish(user.id, projectId, resourceId);
  }

  // specs/014-category-sections contracts/resource-sections.md. Replaces
  // 013's category approve/reject: with the list frozen there is nothing to
  // approve about a *category*, only about what the analysis filed where.
  @Post(':resourceId/sections/:sectionId/approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  approveSection(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('resourceId') resourceId: string,
    @Param('sectionId') sectionId: string,
  ) {
    return this.resourcesService.approveSection(
      user.id,
      projectId,
      resourceId,
      sectionId,
    );
  }

  @Post(':resourceId/sections/:sectionId/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  rejectSection(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('resourceId') resourceId: string,
    @Param('sectionId') sectionId: string,
  ) {
    return this.resourcesService.rejectSection(
      user.id,
      projectId,
      resourceId,
      sectionId,
    );
  }

  @Post(':resourceId/sections/:sectionId/move')
  @HttpCode(HttpStatus.NO_CONTENT)
  moveSection(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('resourceId') resourceId: string,
    @Param('sectionId') sectionId: string,
    @Body() body: MoveResourceSectionDto,
  ) {
    return this.resourcesService.moveSection(
      user.id,
      projectId,
      resourceId,
      sectionId,
      body.categoryKey,
    );
  }

  @Delete(':resourceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('resourceId') resourceId: string,
  ) {
    return this.resourcesService.delete(user.id, projectId, resourceId);
  }
}
