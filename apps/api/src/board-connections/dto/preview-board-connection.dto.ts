import { IsString, MinLength } from 'class-validator';

export class PreviewBoardConnectionDto {
  @IsString()
  @MinLength(1)
  token: string;
}
