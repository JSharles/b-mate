import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { InvitationsModule } from './invitations/invitations.module';
import { BoardConnectionsModule } from './board-connections/board-connections.module';
import { CurrentTaskModule } from './current-task/current-task.module';
import { TaskVulgarizationModule } from './task-vulgarization/task-vulgarization.module';
import { ResourcesModule } from './resources/resources.module';
import { NotionConnectionModule } from './notion-connection/notion-connection.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    ProjectsModule,
    InvitationsModule,
    BoardConnectionsModule,
    TaskVulgarizationModule,
    CurrentTaskModule,
    NotionConnectionModule,
    ResourcesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
