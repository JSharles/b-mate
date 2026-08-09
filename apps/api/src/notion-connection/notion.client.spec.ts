import { NotionAccessError, NotionClient } from './notion.client';

describe('NotionClient', () => {
  let client: NotionClient;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    client = new NotionClient();
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  function jsonResponse(body: unknown, ok = true, status = 200) {
    return {
      ok,
      status,
      json: () => Promise.resolve(body),
    } as Response;
  }

  function richText(text: string) {
    return [{ plain_text: text }];
  }

  it('fetches the page title from the properties whose type is "title"', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          properties: {
            Tags: { type: 'multi_select' },
            Name: { type: 'title', title: richText('Architecture overview') },
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ results: [], has_more: false, next_cursor: null }),
      );

    const result = await client.fetchPage('token-1', 'page-1');

    expect(result.title).toBe('Architecture overview');
  });

  it('falls back to a default title when no title property has any text', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ properties: { Name: { type: 'title', title: [] } } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ results: [], has_more: false, next_cursor: null }),
      );

    const result = await client.fetchPage('token-1', 'page-1');

    expect(result.title).toBe('Untitled Notion page');
  });

  it('flattens paragraph and heading blocks into plain text content', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          properties: { Name: { type: 'title', title: richText('Doc') } },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              id: 'b1',
              type: 'heading_1',
              has_children: false,
              heading_1: { rich_text: richText('Overview') },
            },
            {
              id: 'b2',
              type: 'paragraph',
              has_children: false,
              paragraph: { rich_text: richText('This system does X.') },
            },
          ],
          has_more: false,
          next_cursor: null,
        }),
      );

    const result = await client.fetchPage('token-1', 'page-1');

    expect(result.content).toBe('Overview\n\nThis system does X.');
  });

  it('recurses into nested block children', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          properties: { Name: { type: 'title', title: richText('Doc') } },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              id: 'toggle-1',
              type: 'toggle',
              has_children: true,
              toggle: { rich_text: richText('Details') },
            },
          ],
          has_more: false,
          next_cursor: null,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              id: 'nested-1',
              type: 'paragraph',
              has_children: false,
              paragraph: { rich_text: richText('Nested content.') },
            },
          ],
          has_more: false,
          next_cursor: null,
        }),
      );

    const result = await client.fetchPage('token-1', 'page-1');

    expect(result.content).toBe('Details\n\nNested content.');
  });

  it('paginates through block children until has_more is false', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          properties: { Name: { type: 'title', title: richText('Doc') } },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              id: 'b1',
              type: 'paragraph',
              has_children: false,
              paragraph: { rich_text: richText('Page 1.') },
            },
          ],
          has_more: true,
          next_cursor: 'cursor-2',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              id: 'b2',
              type: 'paragraph',
              has_children: false,
              paragraph: { rich_text: richText('Page 2.') },
            },
          ],
          has_more: false,
          next_cursor: null,
        }),
      );

    const result = await client.fetchPage('token-1', 'page-1');

    expect(result.content).toBe('Page 1.\n\nPage 2.');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const thirdCallUrl = (fetchMock.mock.calls as unknown[][])[2][0];
    expect(String(thirdCallUrl)).toContain('start_cursor=cursor-2');
  });

  it('throws NotionAccessError for an invalid token or inaccessible page', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 401));

    await expect(client.fetchPage('bad-token', 'page-1')).rejects.toThrow(
      NotionAccessError,
    );
  });

  it('skips blocks whose type has no rich_text content', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          properties: { Name: { type: 'title', title: richText('Doc') } },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            { id: 'img-1', type: 'image', has_children: false, image: {} },
            {
              id: 'p-1',
              type: 'paragraph',
              has_children: false,
              paragraph: { rich_text: richText('Text after image.') },
            },
          ],
          has_more: false,
          next_cursor: null,
        }),
      );

    const result = await client.fetchPage('token-1', 'page-1');

    expect(result.content).toBe('Text after image.');
  });

  describe('verifyToken', () => {
    it('resolves with the workspace name for a valid workspace-owned token', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          id: 'bot-1',
          name: 'My Integration',
          bot: { workspace_name: 'Acme Workspace' },
        }),
      );

      const result = await client.verifyToken('good-token');

      expect(result).toEqual({ name: 'Acme Workspace' });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.notion.com/v1/users/me',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer good-token',
          }) as unknown,
        }),
      );
    });

    it('falls back to the integration name when no workspace_name is returned', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ id: 'bot-1', name: 'My Integration', bot: {} }),
      );

      const result = await client.verifyToken('good-token');

      expect(result).toEqual({ name: 'My Integration' });
    });

    it('falls back to a generic label when neither workspace_name nor name is returned', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ id: 'bot-1', name: null, bot: {} }),
      );

      const result = await client.verifyToken('good-token');

      expect(result).toEqual({ name: 'Notion' });
    });

    it('throws NotionAccessError for an invalid token', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 401));

      await expect(client.verifyToken('bad-token')).rejects.toThrow(
        NotionAccessError,
      );
    });
  });
});
