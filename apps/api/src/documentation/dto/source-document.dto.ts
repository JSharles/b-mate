import { Equals, IsInt, IsUrl, MaxLength, Min } from 'class-validator';

export class CreateNotionSourceDocumentDto {
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  pageUrl!: string;
}

export class ConfirmSourceDocumentRemovalDto {
  @IsInt() @Min(1) expectedDocumentVersion!: number;
  @Equals(true) confirmed!: true;
}
