import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BoardConnectionsModule } from '../board-connections/board-connections.module';
import { CurrentTaskController } from './current-task.controller';
import { CurrentTaskService } from './current-task.service';

@Module({
  imports: [AuthModule, BoardConnectionsModule],
  controllers: [CurrentTaskController],
  providers: [CurrentTaskService],
})
export class CurrentTaskModule {}
