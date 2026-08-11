import {
  Equals,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
export class EditorialProfileProposalDto {
  @IsInt() @Min(1) expectedVersion!: number;
  @IsIn(['concise', 'balanced', 'detailed']) length!:
    'concise' | 'balanced' | 'detailed';
  @IsIn(['direct', 'guided', 'highly_explanatory']) pedagogy!:
    'direct' | 'guided' | 'highly_explanatory';
  @IsIn(['novice', 'informed', 'technical']) technicalFamiliarity!:
    'novice' | 'informed' | 'technical';
  @IsIn(['reassuring', 'neutral', 'direct', 'formal']) tone!:
    'reassuring' | 'neutral' | 'direct' | 'formal';
  @IsOptional() @IsString() @MaxLength(2000) guidance?: string | null;
}
export class EditorialProposalActionDto {
  @IsInt() @Min(1) expectedVersion!: number;
}
export class ConfirmEditorialProposalDto extends EditorialProposalActionDto {
  @Equals(true) confirmed!: true;
}
