import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class GuidedCorrectionDto {
  @IsUUID()
  expectedSourceRevisionId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  correctedContent!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  reason?: string;
}
