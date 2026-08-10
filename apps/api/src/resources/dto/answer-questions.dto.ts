import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';

class QuestionAnswerDto {
  @IsUUID()
  questionId: string;

  // Bounded like the correction instruction, and for the same reason: it is
  // forwarded verbatim into the next rebuild's prompt.
  @IsString()
  @Length(1, 2000)
  answer: string;
}

// specs/015 FR-023. Answering is optional and partial — a contributor may
// answer one question out of three and accept the draft with the other two
// still open. Only what they actually answered is sent.
export class AnswerQuestionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuestionAnswerDto)
  answers: QuestionAnswerDto[];
}
