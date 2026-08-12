import { asPrismaService, createPrismaMock } from '../../test/prisma-mock';
import { GenerationHandlerRegistry } from '../../generation/generation-handler.registry';
import { FactualDraftHandler } from './factual-draft.handler';
import { createHash } from 'node:crypto';
const sourceRevisionId = '00000000-0000-4000-8000-000000000001';
const itemId = '00000000-0000-4000-8000-000000000002';
describe('FactualDraftHandler', () => {
  function setup() {
    const prisma = createPrismaMock();
    const registry = { register: jest.fn() };
    const handler = new FactualDraftHandler(
      asPrismaService(prisma),
      registry as unknown as GenerationHandlerRegistry,
    );
    const items = [
      {
        informationItemId: itemId,
        kind: 'fact',
        state: 'confirmed',
        content: 'Fact',
        categories: [{ categoryKey: 'overview' }],
      },
    ];
    const inputFingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          categoryKey: 'overview',
          sourceRevisionId,
          items: [
            { id: itemId, kind: 'fact', state: 'confirmed', content: 'Fact' },
          ],
          correctionInstruction: null,
        }),
      )
      .digest('hex');
    const operation = {
      id: 'operation',
      projectId: 'project',
      type: 'factual_drafting',
      sourceRevisionId,
      inputFingerprint,
    };
    return { prisma, registry, handler, items, operation };
  }
  it('registers, builds a category-only request, and applies complete output', async () => {
    const { prisma, registry, handler, items, operation } = setup();
    handler.onModuleInit();
    expect(registry.register).toHaveBeenCalledWith(handler);
    prisma.documentationCategoryReferenceDraft.findUnique.mockResolvedValue({
      id: 'draft',
      categoryKey: 'overview',
      sourceRevisionId,
      status: 'generating',
      parentDraft: null,
      sourceRevision: { projectSource: { workingLanguage: 'fr' }, items },
    });
    const request = await handler.buildRequest(operation as never);
    expect(request.parts[0]).toMatchObject({
      kind: 'text',
      text: expect.stringContaining('Fact'),
    });
    prisma.documentationCategoryReferenceDraft.findUnique.mockResolvedValue({
      id: 'draft',
      categoryKey: 'overview',
      sourceRevisionId,
      sourceRevision: { items },
    });
    await handler.apply(asPrismaService(prisma), operation as never, {
      output: {
        promptVersion: 'factual-draft-v2',
        categoryKey: 'overview',
        blocks: [{ type: 'fact', text: 'Fact', informationItemIds: [itemId] }],
        changeSummary: 'No ambiguity',
        provenanceSummary: [{ label: 'Brief', itemCount: 1 }],
      },
    });
    expect(
      prisma.documentationCategoryReferenceDraft.update,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'pending_review' }),
      }),
    );
  });
  it('rejects stale drafts and fingerprint drift', async () => {
    const { prisma, handler, operation, items } = setup();
    prisma.documentationCategoryReferenceDraft.findUnique.mockResolvedValue(
      null,
    );
    await expect(handler.buildRequest(operation as never)).rejects.toThrow(
      'NOT_CURRENT',
    );
    prisma.documentationCategoryReferenceDraft.findUnique.mockResolvedValue({
      categoryKey: 'overview',
      sourceRevisionId,
      status: 'generating',
      parentDraft: null,
      sourceRevision: { projectSource: { workingLanguage: 'fr' }, items },
    });
    await expect(
      handler.buildRequest({
        ...operation,
        // Our own fingerprint, not one the model echoed: this guard compares
        // what the draft's inputs hash to now against what they hashed to when
        // the operation was created, and it stays.
        inputFingerprint: 'b'.repeat(64),
      } as never),
    ).rejects.toThrow('INPUT_DRIFT');
  });

  it('binds the latest factual correction to the fingerprint and prompt', async () => {
    const { prisma, handler, items, operation } = setup();
    const correctionInstruction =
      'Corriger la date de livraison : elle est fixée au 12 septembre.';
    const inputFingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          categoryKey: 'overview',
          sourceRevisionId,
          items: [
            { id: itemId, kind: 'fact', state: 'confirmed', content: 'Fact' },
          ],
          correctionInstruction,
        }),
      )
      .digest('hex');
    prisma.documentationCategoryReferenceDraft.findUnique.mockResolvedValue({
      id: 'corrected-draft',
      categoryKey: 'overview',
      sourceRevisionId,
      status: 'correction_generating',
      parentDraft: {
        reviews: [{ instruction: correctionInstruction }],
      },
      sourceRevision: { projectSource: { workingLanguage: 'fr' }, items },
    });

    const request = await handler.buildRequest({
      ...operation,
      inputFingerprint,
    } as never);

    expect(request.parts[0]).toMatchObject({
      kind: 'text',
      text: expect.stringContaining(correctionInstruction),
    });
  });

  it('rejects mismatched and incomplete provider output before publishing a draft', async () => {
    const { prisma, handler, items, operation } = setup();
    const validOutput = {
      promptVersion: 'factual-draft-v2' as const,
      categoryKey: 'overview' as const,
      blocks: [
        { type: 'fact' as const, text: 'Fact', informationItemIds: [itemId] },
      ],
      changeSummary: 'No ambiguity',
      provenanceSummary: [{ label: 'Brief', itemCount: 1 }],
    };
    // The output no longer echoes the fingerprint or the revision id back:
    // copying 64 random characters plus a UUID verified nothing the plumbing
    // did not already guarantee, and killed this stage twice when the model
    // got one character wrong. What still has to hold is that the draft this
    // result belongs to is the current one — checked below.

    prisma.documentationCategoryReferenceDraft.findUnique.mockResolvedValue({
      id: 'draft',
      categoryKey: 'planning',
      sourceRevisionId,
      sourceRevision: { items },
    });
    await expect(
      handler.apply(asPrismaService(prisma), operation as never, {
        output: validOutput,
      }),
    ).rejects.toThrow('NOT_CURRENT');
    prisma.documentationCategoryReferenceDraft.findUnique.mockResolvedValue(
      null,
    );
    await expect(
      handler.apply(asPrismaService(prisma), operation as never, {
        output: validOutput,
      }),
    ).rejects.toThrow('NOT_CURRENT');
  });
});
