import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectAccessService } from './project-access.service';

@Module({
  imports: [AuthModule],
  controllers: [ProjectsController],
  providers: [ProjectAccessService, ProjectsService],
  exports: [ProjectAccessService, ProjectsService],
})
export class ProjectsModule {}
