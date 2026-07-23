import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BoardConnectionsController } from './board-connections.controller';
import { BoardConnectionsService } from './board-connections.service';
import { GithubProjectsClient } from './github-projects.client';

@Module({
  imports: [AuthModule],
  controllers: [BoardConnectionsController],
  providers: [BoardConnectionsService, GithubProjectsClient],
})
export class BoardConnectionsModule {}
