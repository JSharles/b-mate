import {
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
} from 'class-validator';
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

  // specs/008-current-task-progress FR-005b — defaults to "days" in the
  // service when omitted.
  @IsOptional()
  @IsIn(['days', 'hours'])
  estimateUnit?: 'days' | 'hours';
}
