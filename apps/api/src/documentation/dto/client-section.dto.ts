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
  // Absent means prose: the kind arrived with roadmaps, and a body written
  // before them still means what it meant.
  @IsOptional()
  @IsIn(['prose', 'roadmap'])
  kind?: 'prose' | 'roadmap';

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  // A roadmap has neither: its brief is fixed — what the documents say about
  // sequence — and a milestone date has no tone. Choosing a roadmap removes
  // controls rather than adding them (specs/020).
  @ValidateIf((dto: CreateClientSectionDto) => dto.kind !== 'roadmap')
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  instructions!: string;

  @ValidateIf((dto: CreateClientSectionDto) => dto.kind !== 'roadmap')
  @ValidateNested()
  @Type(() => SectionEditorialDto)
  editorial!: SectionEditorialDto;
}

// What sits inside a milestone, as the developer sends it back. Its "when" may
// be absent: a feature inside a phase often has no date of its own.
//
// It carries no `substeps` of its own — the roadmap is two levels deep, and the
// validator is what makes a third impossible rather than merely discouraged.
export class SubstepDraftDto {
  @IsOptional()
  @IsUUID('4')
  id?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  when?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}

// One milestone as the developer sends it back. An id only for one they kept,
// so a new milestone is unambiguous and can never collide with an existing id.
export class MilestoneDraftDto {
  @IsOptional()
  @IsUUID('4')
  id?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  when!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  // The whole tree travels, both levels of it. Declared here because the
  // validation pipe strips what it does not know about: a `substeps` missing
  // from this class is a `substeps` the service never sees.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubstepDraftDto)
  substeps?: SubstepDraftDto[];
}

// The whole ordered set travels, so the result is never a function of what the
// server already held — the same reason reordering carries every section id.
export class ReplaceMilestonesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MilestoneDraftDto)
  milestones!: MilestoneDraftDto[];

  @IsInt()
  @Min(1)
  expectedProposalVersion!: number;
}

// Null clears it: a plan with no position claimed is a real answer, and better
// than one that defaults to its first step.
export class SetCurrentMilestoneDto {
  @IsOptional()
  @IsUUID('4')
  milestoneId?: string | null;

  @IsInt()
  @Min(1)
  expectedVersion!: number;
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
