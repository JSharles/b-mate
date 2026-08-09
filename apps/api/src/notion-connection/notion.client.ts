import { Injectable } from '@nestjs/common';

const NOTION_API_URL = 'https://api.notion.com/v1';
// Pinned per Notion's API versioning scheme — an explicit version avoids
// silently picking up a breaking response-shape change.
const NOTION_VERSION = '2022-06-28';

// Thrown for an invalid/expired token or a page the token can't access
// (a non-2xx from the Notion API) — the service layer turns this into a
// clean 400 for the developer, mirroring GithubAuthError in
// board-connections/github-projects.client.ts.
export class NotionAccessError extends Error {}

interface NotionRichText {
  plain_text: string;
}

interface NotionBlock {
  id: string;
  type: string;
  has_children: boolean;
  [key: string]: unknown;
}

interface ListBlockChildrenResponse {
  results: NotionBlock[];
  has_more: boolean;
  next_cursor: string | null;
}

interface NotionPageProperty {
  type: string;
  title?: NotionRichText[];
}

interface NotionPageResponse {
  properties: Record<string, NotionPageProperty>;
}

export interface NotionPageContent {
  title: string;
  content: string;
}

// Notion's own bot-user shape (GET /v1/users/me for a bot token) — only the
// fields this app actually reads.
interface NotionBotUserResponse {
  name: string | null;
  bot?: {
    workspace_name?: string | null;
  };
}

export interface NotionIdentity {
  // The workspace name when the integration is workspace-owned (the common
  // case) — falls back to the integration's own display name when Notion
  // doesn't return one (e.g. a user-owned integration).
  name: string;
}

// specs/011-project-resources research.md Decision 5: Notion content is
// fetched as plain text only — no image blocks are forwarded to Claude's
// vision input for v1 (Notion's own image URLs are short-lived presigned
// links, real fetch-timing complexity for a P2 path). Block children are
// fetched recursively so nested content (toggles, nested lists) is included.
@Injectable()
export class NotionClient {
  async fetchPage(token: string, pageId: string): Promise<NotionPageContent> {
    const title = await this.fetchPageTitle(token, pageId);
    const blocks = await this.fetchBlockChildren(token, pageId);
    const content = (await this.flattenBlocks(token, blocks)).join('\n\n');

    return { title, content };
  }

  // specs/012-project-settings research.md Decision 2: the standard way to
  // validate a Notion integration token in isolation, without needing any
  // specific page shared with it — used by NotionConnectionService.connect()
  // to verify-before-persist, mirroring BoardConnectionsService.connect().
  // Also returns the workspace/integration identity Notion's own response
  // already carries, so the developer sees *what* they connected instead of
  // a bare "Connected" (2026-08-08 critique, P1).
  async verifyToken(token: string): Promise<NotionIdentity> {
    const res = await this.request(token, '/users/me');
    const data = (await res.json()) as NotionBotUserResponse;
    const name =
      data.bot?.workspace_name?.trim() || data.name?.trim() || 'Notion';

    return { name };
  }

  private async fetchPageTitle(token: string, pageId: string): Promise<string> {
    const res = await this.request(token, `/pages/${pageId}`);
    const data = (await res.json()) as NotionPageResponse;

    // The title property's key varies by page (e.g. "title" for a plain
    // page, but a database row names it after its own title column) — find
    // it by type instead of by key.
    const titleProperty = Object.values(data.properties).find(
      (property) => property.type === 'title',
    );
    const title = (titleProperty?.title ?? [])
      .map((t) => t.plain_text)
      .join('');

    return title.trim() || 'Untitled Notion page';
  }

  private async fetchBlockChildren(
    token: string,
    blockId: string,
  ): Promise<NotionBlock[]> {
    const blocks: NotionBlock[] = [];
    let cursor: string | undefined;

    do {
      const query = cursor
        ? `?page_size=100&start_cursor=${cursor}`
        : '?page_size=100';
      const res = await this.request(
        token,
        `/blocks/${blockId}/children${query}`,
      );
      const data = (await res.json()) as ListBlockChildrenResponse;
      blocks.push(...data.results);
      cursor = data.has_more ? (data.next_cursor ?? undefined) : undefined;
    } while (cursor);

    return blocks;
  }

  private async flattenBlocks(
    token: string,
    blocks: NotionBlock[],
  ): Promise<string[]> {
    const parts: string[] = [];

    for (const block of blocks) {
      const text = extractBlockText(block);
      if (text) {
        parts.push(text);
      }

      if (block.has_children) {
        const children = await this.fetchBlockChildren(token, block.id);
        parts.push(...(await this.flattenBlocks(token, children)));
      }
    }

    return parts;
  }

  private async request(token: string, path: string): Promise<Response> {
    const res = await fetch(`${NOTION_API_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': NOTION_VERSION,
      },
    });

    if (!res.ok) {
      throw new NotionAccessError(
        `Unable to access this Notion page (status ${res.status})`,
      );
    }

    return res;
  }
}

function extractBlockText(block: NotionBlock): string | null {
  const body = block[block.type] as
    { rich_text?: NotionRichText[] } | undefined;
  const richText = body?.rich_text;
  if (!richText || richText.length === 0) {
    return null;
  }
  return richText.map((t) => t.plain_text).join('');
}
