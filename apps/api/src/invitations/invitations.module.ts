import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InvitationAcceptanceController } from './invitation-acceptance.controller';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';

@Module({
  imports: [AuthModule],
  controllers: [InvitationsController, InvitationAcceptanceController],
  providers: [InvitationsService],
})
export class InvitationsModule {}
