import { IsOptional, IsString, MinLength } from 'class-validator';

export class AcceptInvitationDto {
  @IsString()
  @MinLength(8)
  password: string;

  // Only required when the invited email has no existing account yet — see
  // InvitationsService.accept.
  @IsOptional()
  @IsString()
  @MinLength(1)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  lastName?: string;
}
