import { IsOptional, IsString, MinLength } from 'class-validator';

// `token` is optional as of specs/010-github-oauth-board-connection: the
// OAuth flow resolves it from a short-lived server-side cookie instead
// (research.md Decision 5) — only the legacy paste-a-PAT path still sends
// one here (FR-007).
export class PreviewBoardConnectionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  token?: string;
}
