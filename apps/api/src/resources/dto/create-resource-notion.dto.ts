import { IsUrl } from 'class-validator';

// specs/012-project-settings: the Notion integration token is configured
// once, standalone, in Settings (NotionConnectionModule) — creating a
// Notion-sourced resource only ever needs the page URL.
export class CreateResourceNotionDto {
  @IsUrl()
  pageUrl: string;
}
