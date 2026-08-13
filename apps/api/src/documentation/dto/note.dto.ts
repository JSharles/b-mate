import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AddNoteDto {
  // What the developer wrote. It has to stand on its own: the next write remakes
  // the document, so the paragraph that prompted it will not exist.
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content!: string;

  // A frozen copy of what prompted it — the question, or the paragraph being
  // corrected. Copied, never pointed at, for the same reason.
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  context?: string;
}
