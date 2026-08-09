import { IsOptional, IsString } from 'class-validator';

// null explicitly clears a field; undefined (field omitted) leaves it
// untouched — same convention as UpdateProjectDto.
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  roleTitle?: string | null;

  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsOptional()
  @IsString()
  github?: string | null;

  @IsOptional()
  @IsString()
  linkedin?: string | null;

  @IsOptional()
  @IsString()
  malt?: string | null;

  @IsOptional()
  @IsString()
  website?: string | null;
}
