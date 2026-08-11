import {
  Equals,
  IsInt,
  IsString,
  IsUrl,
  IsUUID,
  IsOptional,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateNotionSourceDocumentDto {
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  pageUrl!: string;
}

export class ConfirmSourceDocumentRemovalDto {
  @IsInt() @Min(1) expectedDocumentVersion!: number;
  @IsOptional() @IsUUID() expectedSourceRevisionId!: string | null;
  @IsString() @MinLength(16) @MaxLength(128) confirmationToken!: string;
  @Equals(true) confirmed!: true;
}
