import { ProjectDateFormat, ProjectLanguage } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  // null explicitly clears the link; undefined (field omitted) leaves it
  // untouched — Prisma's update() already treats undefined as "don't
  // touch this column", so no extra branching is needed in the service.
  @IsOptional()
  @IsString()
  meetingUrl?: string | null;

  // Same null-clears/undefined-leaves-untouched convention as meetingUrl
  // above. No format validation on the timezone string itself (e.g. against
  // the IANA list) — the frontend only ever offers a fixed dropdown of
  // known values, so anything else can't reach this endpoint in practice.
  @IsOptional()
  @IsString()
  timezone?: string | null;

  @IsOptional()
  @IsEnum(ProjectDateFormat)
  dateFormat?: ProjectDateFormat | null;

  @IsOptional()
  @IsEnum(ProjectLanguage)
  language?: ProjectLanguage | null;
}
