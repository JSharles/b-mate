import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class ClarificationQueryDto {
  @IsOptional()
  @IsIn(['open', 'left_open', 'answered', 'superseded'])
  status?: 'open' | 'left_open' | 'answered' | 'superseded';

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  cursor?: string;
}

export class ClarificationResolutionDto {
  @IsUUID()
  clarificationId!: string;

  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsIn(['answer', 'leave_open'])
  action!: 'answer' | 'leave_open';

  @ValidateIf((value: ClarificationResolutionDto) => value.action === 'answer')
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  answer?: string;
}

export class ResolveClarificationsDto {
  @IsUUID()
  expectedSourceRevisionId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ClarificationResolutionDto)
  resolutions!: ClarificationResolutionDto[];
}
