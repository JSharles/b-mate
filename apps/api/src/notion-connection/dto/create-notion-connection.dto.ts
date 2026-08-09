import { IsString, MinLength } from 'class-validator';

export class CreateNotionConnectionDto {
  @IsString()
  @MinLength(1)
  token: string;
}
