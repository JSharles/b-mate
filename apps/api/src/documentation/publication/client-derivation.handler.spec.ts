import { asPrismaService, createPrismaMock } from '../../test/prisma-mock';
import { GenerationHandlerRegistry } from '../../generation/generation-handler.registry';
import { ClientDerivationHandler } from './client-derivation.handler';
const referenceId = '00000000-0000-4000-8000-000000000001';
const profileId = '00000000-0000-4000-8000-000000000002';
const releaseId = '00000000-0000-4000-8000-000000000003';
const openId = '00000000-0000-4000-8000-000000000004';
describe('ClientDerivationHandler', () => {
  function setup() {
    const prisma = createPrismaMock();
    const registry = { register: jest.fn() };
    const handler = new ClientDerivationHandler(
      asPrismaService(prisma),
      registry as unknown as GenerationHandlerRegistry,
    );
    const reference = {
      id: referenceId,
      projectId: 'project',
      sourceRevisionId: 'revision',
      categoryKey: 'overview',
      structuredContent: [
        { type: 'open_point', openPointId: openId, text: 'TBD' },
      ],
    };
    const profile = {
      id: profileId,
      length: 'concise',
      pedagogy: 'guided',
      technicalFamiliarity: 'novice',
      tone: 'reassuring',
      guidance: null,
    };
    const operation = {
      id: 'operation',
      projectId: 'project',
      categoryReferenceId: referenceId,
      profileRevisionId: profileId,
      clientReleaseId: releaseId,
    };
    return { prisma, registry, handler, reference, profile, operation };
  }
  it('builds from validated reference and atomically publishes a complete release', async () => {
    const { prisma, registry, handler, reference, profile, operation } =
      setup();
    handler.onModuleInit();
    expect(registry.register).toHaveBeenCalled();
    prisma.documentationCategoryReference.findUnique.mockResolvedValue(
      reference,
    );
    prisma.editorialProfileRevision.findUnique.mockResolvedValue(profile);
    await expect(
      handler.buildRequest(operation as never),
    ).resolves.toMatchObject({ outputContract: 'client-derivation-v2' });
    prisma.documentationCategoryReference.findUnique.mockResolvedValue(
      reference,
    );
    prisma.clientCategoryContent.upsert.mockResolvedValue({ id: 'content' });
    prisma.clientContentRelease.findUnique.mockResolvedValue({
      id: releaseId,
      baseReleaseId: null,
      expectedCategoryCount: 1,
      status: 'preparing',
      entries: [{}],
    });
    prisma.projectClientPublication.findUnique.mockResolvedValue({
      currentReleaseId: null,
    });
    await handler.apply(asPrismaService(prisma), operation as never, {
      output: {
        promptVersion: 'client-derivation-v2',
        categoryKey: 'overview',
        locale: 'fr',
        blocks: [{ type: 'open_point', text: 'TBD', openPointId: openId }],
      },
    });
    expect(prisma.clientCategoryContent.upsert).toHaveBeenCalled();
    expect(prisma.projectClientPublication.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentReleaseId: releaseId }),
      }),
    );
  });
  it('preserves the current release when a candidate base became stale', async () => {
    const { prisma, handler, reference, operation } = setup();
    prisma.documentationCategoryReference.findUnique.mockResolvedValue(
      reference,
    );
    prisma.clientCategoryContent.upsert.mockResolvedValue({ id: 'content' });
    prisma.clientContentRelease.findUnique.mockResolvedValue({
      id: releaseId,
      baseReleaseId: 'old',
      expectedCategoryCount: 1,
      status: 'preparing',
      entries: [{}],
    });
    prisma.projectClientPublication.findUnique.mockResolvedValue({
      currentReleaseId: 'newer',
    });
    await handler.apply(asPrismaService(prisma), operation as never, {
      output: {
        promptVersion: 'client-derivation-v2',
        categoryKey: 'overview',
        locale: 'fr',
        blocks: [{ type: 'open_point', text: 'TBD', openPointId: openId }],
      },
    });
    expect(prisma.clientContentRelease.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'superseded' } }),
    );
    expect(prisma.projectClientPublication.update).not.toHaveBeenCalled();
  });
  it('rejects missing links, mismatches, and lost open points', async () => {
    const { prisma, handler, reference, operation } = setup();
    await expect(handler.buildRequest({} as never)).rejects.toThrow(
      'LINKS_MISSING',
    );
    prisma.documentationCategoryReference.findUnique.mockResolvedValue(
      reference,
    );
    prisma.editorialProfileRevision.findUnique.mockResolvedValue(null);
    await expect(handler.buildRequest(operation as never)).rejects.toThrow(
      'INPUT_MISSING',
    );
    prisma.documentationCategoryReference.findUnique.mockResolvedValue(
      reference,
    );
    await expect(
      handler.apply(asPrismaService(prisma) as never, operation as never, {
        output: {
          promptVersion: 'client-derivation-v2',
          categoryKey: 'overview',
          locale: 'fr',
          blocks: [],
        },
      }),
    ).rejects.toThrow('OPEN_POINT_COVERAGE');
  });
});
