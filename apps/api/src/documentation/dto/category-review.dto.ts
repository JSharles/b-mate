import { IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class ReviewDraftDto {
  @IsInt() @Min(1) expectedVersion!: number;
}
export class CorrectDraftDto extends ReviewDraftDto {
  @IsString() @MinLength(1) @MaxLength(4000) instruction!: string;
}
