const mockCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }));
});

import { AnthropicVulgarizationClient } from './anthropic-vulgarization.client';

describe('AnthropicVulgarizationClient', () => {
  let client: AnthropicVulgarizationClient;

  beforeEach(() => {
    mockCreate.mockReset();
    client = new AnthropicVulgarizationClient();
  });

  it('parses a well-formed tool-use response into title/description', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          name: 'submit_vulgarization',
          input: {
            title: 'Securing your logins',
            description: 'We made sign-in safer for everyone.',
          },
        },
      ],
    });

    const result = await client.vulgarize({
      projectTitle: 'Client website',
      taskTitle: 'Refactor auth middleware',
      taskDescription: 'Rework the session validation layer.',
      locale: 'en',
    });

    expect(result).toEqual({
      title: 'Securing your logins',
      description: 'We made sign-in safer for everyone.',
    });
  });

  it('tells the model which language to answer in, per the requested locale', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          name: 'submit_vulgarization',
          input: { title: 'Sécurisation des connexions', description: null },
        },
      ],
    });

    await client.vulgarize({
      projectTitle: 'Client website',
      taskTitle: 'Refactor auth middleware',
      taskDescription: null,
      locale: 'fr',
    });

    const [params] = mockCreate.mock.calls[0] as [{ system: string }];
    expect(params.system).toContain('French');
    expect(params.system).not.toContain('English');
  });

  it('throws when the response has no tool_use block', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'I refuse.' }],
    });

    await expect(
      client.vulgarize({
        projectTitle: 'Client website',
        taskTitle: 'Refactor auth middleware',
        taskDescription: null,
        locale: 'en',
      }),
    ).rejects.toThrow('Anthropic response did not include a tool_use block');
  });

  it('throws when the tool_use input does not match the expected schema', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          name: 'submit_vulgarization',
          input: { title: 42, description: null },
        },
      ],
    });

    await expect(
      client.vulgarize({
        projectTitle: 'Client website',
        taskTitle: 'Refactor auth middleware',
        taskDescription: null,
        locale: 'en',
      }),
    ).rejects.toThrow();
  });

  it('propagates an SDK-level error (network, timeout)', async () => {
    mockCreate.mockRejectedValue(new Error('request timed out'));

    await expect(
      client.vulgarize({
        projectTitle: 'Client website',
        taskTitle: 'Refactor auth middleware',
        taskDescription: null,
        locale: 'en',
      }),
    ).rejects.toThrow('request timed out');
  });

  describe('estimateTask', () => {
    it('parses a well-formed tool-use response into duration/complexity', async () => {
      mockCreate.mockResolvedValue({
        content: [
          {
            type: 'tool_use',
            name: 'submit_task_estimate',
            input: { estimatedDurationDays: 4, complexity: 'complex' },
          },
        ],
      });

      const result = await client.estimateTask({
        taskTitle: 'N+1 query pattern in ProjectMembersList',
        taskDescription: 'Loading /projects/:id triggers one query per member.',
      });

      expect(result).toEqual({
        estimatedDurationDays: 4,
        complexity: 'complex',
      });
    });

    it('never asks for or receives an absolute date — only a duration', async () => {
      mockCreate.mockResolvedValue({
        content: [
          {
            type: 'tool_use',
            name: 'submit_task_estimate',
            input: { estimatedDurationDays: 1, complexity: 'simple' },
          },
        ],
      });

      await client.estimateTask({
        taskTitle: 'Fix typo in footer copyright year',
        taskDescription: null,
      });

      const [params] = mockCreate.mock.calls[0] as [{ system: string }];
      expect(params.system).toContain('duration');
      expect(params.system).toContain('never attempt calendar arithmetic');
    });

    it('throws when the response has no tool_use block', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'I refuse.' }],
      });

      await expect(
        client.estimateTask({ taskTitle: 'Fix bug', taskDescription: null }),
      ).rejects.toThrow('Anthropic response did not include a tool_use block');
    });

    it('throws when the tool_use input does not match the expected schema', async () => {
      mockCreate.mockResolvedValue({
        content: [
          {
            type: 'tool_use',
            name: 'submit_task_estimate',
            input: { estimatedDurationDays: 'a few', complexity: 'simple' },
          },
        ],
      });

      await expect(
        client.estimateTask({ taskTitle: 'Fix bug', taskDescription: null }),
      ).rejects.toThrow();
    });

    it('propagates an SDK-level error (network, timeout)', async () => {
      mockCreate.mockRejectedValue(new Error('request timed out'));

      await expect(
        client.estimateTask({ taskTitle: 'Fix bug', taskDescription: null }),
      ).rejects.toThrow('request timed out');
    });
  });
});
