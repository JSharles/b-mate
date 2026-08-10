import { IsString, Length } from 'class-validator';

// specs/015 FR-015. The contributor's correction in their own words — the only
// thing they write. Bounded because it is forwarded verbatim into a prompt.
export class RegenerateDraftDto {
  @IsString()
  @Length(1, 2000)
  instruction: string;
}
