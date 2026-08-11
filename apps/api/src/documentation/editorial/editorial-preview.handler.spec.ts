import { asPrismaService, createPrismaMock } from '../../test/prisma-mock';
import { GenerationHandlerRegistry } from '../../generation/generation-handler.registry';
import { EditorialPreviewHandler } from './editorial-preview.handler';
const proposalId = '00000000-0000-4000-8000-000000000001';
const openId = '00000000-0000-4000-8000-000000000002';
describe('EditorialPreviewHandler', () => {
  it('builds from real reference content and preserves open markers on apply', async () => {
    const prisma = createPrismaMock();
    const registry = { register: jest.fn() };
    const handler = new EditorialPreviewHandler(
      asPrismaService(prisma),
      registry as unknown as GenerationHandlerRegistry,
    );
    handler.onModuleInit();
    const reference = {
      categoryKey: 'overview',
      structuredContent: [
        { type: 'open_point', text: 'TBD', openPointId: openId },
      ],
    };
    const proposal = {
      id: proposalId,
      status: 'preview_pending',
      length: 'concise',
      pedagogy: 'guided',
      technicalFamiliarity: 'novice',
      tone: 'reassuring',
      guidance: null,
      representativeCategoryReference: reference,
    };
    prisma.editorialProfileProposal.findUnique.mockResolvedValue(proposal);
    const operation = {
      id: 'op',
      projectId: 'project',
      profileProposalId: proposalId,
      inputFingerprint: 'a'.repeat(64),
    };
    await expect(
      handler.buildRequest(operation as never),
    ).resolves.toMatchObject({ outputContract: 'editorial-preview-v1' });
    await handler.apply(asPrismaService(prisma), operation as never, {
      output: {
        promptVersion: 'editorial-preview-v1',
        inputFingerprint: operation.inputFingerprint,
        categoryKey: 'overview',
        blocks: [
          { type: 'open_point', text: 'Still TBD', openPointId: openId },
        ],
      },
    });
    expect(prisma.editorialPreview.update).toHaveBeenCalled();
    expect(prisma.editorialProfileProposal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'preview_ready' }),
      }),
    );
  });
  it('rejects missing proposals and lost open points', async () => {
    const prisma = createPrismaMock();
    const handler = new EditorialPreviewHandler(
      asPrismaService(prisma),
      {} as GenerationHandlerRegistry,
    );
    prisma.editorialProfileProposal.findUnique.mockResolvedValue(null);
    await expect(
      handler.buildRequest({ profileProposalId: proposalId } as never),
    ).rejects.toThrow('NOT_CURRENT');
    prisma.editorialProfileProposal.findUnique.mockResolvedValue({
      id: proposalId,
      representativeCategoryReference: {
        categoryKey: 'overview',
        structuredContent: [{ type: 'open_point', openPointId: openId }],
      },
    });
    await expect(
      handler.apply(
        asPrismaService(prisma) as never,
        {
          profileProposalId: proposalId,
          inputFingerprint: 'a'.repeat(64),
        } as never,
        {
          output: {
            promptVersion: 'editorial-preview-v1',
            inputFingerprint: 'a'.repeat(64),
            categoryKey: 'overview',
            blocks: [],
          },
        },
      ),
    ).rejects.toThrow('OPEN_POINT_COVERAGE');
  });
});
