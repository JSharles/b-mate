import { Injectable } from '@nestjs/common';

const EDITORIAL_PATTERNS = [
  /plus\s+(court|concis|p[eé]dagogique|simple)/iu,
  /moins\s+(technique|long|d[eé]taill[eé])/iu,
  /ton\s+(plus\s+)?(rassurant|formel|direct|neutre)/iu,
  /shorter|more\s+(concise|pedagogical|simple)|less\s+technical|tone/iu,
];

@Injectable()
export class EditorialIntentService {
  isEditorial(instruction: string): boolean {
    return EDITORIAL_PATTERNS.some((pattern) => pattern.test(instruction));
  }
}
