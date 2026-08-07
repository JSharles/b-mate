import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GithubOauthClient } from './github-oauth.client';
import { SessionGuard } from './session.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionGuard, GithubOauthClient],
  exports: [AuthService, SessionGuard, GithubOauthClient],
})
export class AuthModule {}
