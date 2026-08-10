import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionGuard } from '../auth/session.guard';
import { CreateResourceNotionDto } from './dto/create-resource-notion.dto';
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
  findAll(@CurrentUser() user: User, @Param('projectId') projectId: string) {
    return this.resourcesService.findAllForProject(user.id, projectId);
  }

  @Get(':resourceId')
  findOne(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('resourceId') resourceId: string,
  ) {
    return this.resourcesService.findOne(user.id, projectId, resourceId);
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
