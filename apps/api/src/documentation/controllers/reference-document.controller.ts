import {
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../auth/current-user.decorator';
import { SessionGuard } from '../../auth/session.guard';
import { ReferenceDocumentService } from '../reference/reference-document.service';

@Controller('projects/:projectId/documentation/reference')
@UseGuards(SessionGuard)
export class ReferenceDocumentController {
  constructor(private readonly reference: ReferenceDocumentService) {}

  @Get()
  current(@CurrentUser() user: User, @Param('projectId') projectId: string) {
    return this.reference.current(user.id, projectId);
  }

  @Get('summary')
  summary(@CurrentUser() user: User, @Param('projectId') projectId: string) {
    return this.reference.summary(user.id, projectId);
  }

  @Post()
  @HttpCode(202)
  write(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    // The guard has already remembered this on the user; reading it here too
    // means a first write is in the right language without waiting for a
    // second request.
    @Headers('x-interface-locale') headerLocale?: string,
  ) {
    return this.reference.write(
      user.id,
      projectId,
      headerLocale ?? user.locale ?? null,
    );
  }
}
