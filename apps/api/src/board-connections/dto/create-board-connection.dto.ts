import { IsIn, IsInt, IsPositive, IsString, MinLength } from 'class-validator';
import type { GithubOwnerType } from '../github-projects.client';

export class CreateBoardConnectionDto {
  @IsString()
  @MinLength(1)
  token: string;

  @IsString()
  ownerLogin: string;

  @IsIn(['User', 'Organization'])
  ownerType: GithubOwnerType;

  @IsInt()
  @IsPositive()
  number: number;
}
