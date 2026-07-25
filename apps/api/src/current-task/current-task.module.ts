import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TaskVulgarizationModule } from '../task-vulgarization/task-vulgarization.module';
import { CurrentTaskController } from './current-task.controller';
import { CurrentTaskService } from './current-task.service';

@Module({
  imports: [AuthModule, TaskVulgarizationModule],
  controllers: [CurrentTaskController],
  providers: [CurrentTaskService],
})
export class CurrentTaskModule {}
