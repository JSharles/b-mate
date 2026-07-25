import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BoardConnectionsModule } from '../board-connections/board-connections.module';
import { AnthropicVulgarizationClient } from './anthropic-vulgarization.client';
import { TaskVulgarizationService } from './task-vulgarization.service';

@Module({
  imports: [BoardConnectionsModule, ScheduleModule.forRoot()],
  providers: [TaskVulgarizationService, AnthropicVulgarizationClient],
  exports: [TaskVulgarizationService],
})
export class TaskVulgarizationModule {}
