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
  ValidateNested,
} from 'class-validator';

// The four editorial dimensions, stated per section rather than per project
// (specs/017 research Decision 6). The literal unions mirror the Prisma enums;
// `packages/schemas` carries the same shape for the web side.
export class SectionEditorialDto {
  @IsIn(['concise', 'balanced', 'detailed'])
  length!: 'concise' | 'balanced' | 'detailed';

  @IsIn(['direct', 'guided', 'highly_explanatory'])
  pedagogy!: 'direct' | 'guided' | 'highly_explanatory';

  @IsIn(['novice', 'informed', 'technical'])
  technicalFamiliarity!: 'novice' | 'informed' | 'technical';

  @IsIn(['reassuring', 'neutral', 'direct', 'formal'])
  tone!: 'reassuring' | 'neutral' | 'direct' | 'formal';
}

export class CreateClientSectionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  instructions!: string;

  @ValidateNested()
  @Type(() => SectionEditorialDto)
  editorial!: SectionEditorialDto;
}

// Every field optional so a rename, a retone and an instruction revision are the
// same call. `expectedVersion` is mandatory: it is what turns a concurrent edit
// into a refusal rather than a silent overwrite.
export class UpdateClientSectionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  instructions?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SectionEditorialDto)
  editorial?: SectionEditorialDto;

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

// FR-012: approving names the version the contributor actually read, so a
// proposal replaced under them is refused rather than approved unseen.
export class ApproveSectionProposalDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

// The full ordered set travels every time, so the resulting order is never a
// function of what the server already held.
export class ReorderClientSectionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  orderedSectionIds!: string[];
}
