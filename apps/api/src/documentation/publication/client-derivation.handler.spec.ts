import { asPrismaService, createPrismaMock } from '../../test/prisma-mock';
import { GenerationHandlerRegistry } from '../../generation/generation-handler.registry';
import { ClientDerivationHandler } from './client-derivation.handler';

const proposalId = '00000000-0000-4000-8000-000000000001';
const sectionId = '00000000-0000-4000-8000-000000000002';
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
    const proposal = {
      id: proposalId,
      sectionId,
      status: 'approved',
      structuredContent: [
        { type: 'open_point', openPointId: openId, text: 'TBD' },
      ],
      // Register travels on the section, not on a project-wide profile.
      section: {
        name: 'What the client asked for',
        length: 'concise',
        pedagogy: 'guided',
        technicalFamiliarity: 'novice',
        tone: 'reassuring',
      },
    };
    const operation = {
      id: 'operation',
      projectId: 'project',
      sectionProposalId: proposalId,
      clientReleaseId: releaseId,
    };
    return { prisma, registry, handler, proposal, operation };
  }

  it('builds from the approved proposal and names the section it is writing', async () => {
    const { prisma, registry, handler, proposal, operation } = setup();
    handler.onModuleInit();
    expect(registry.register).toHaveBeenCalled();
    prisma.sectionProposal.findUnique.mockResolvedValue(proposal);

    const request = await handler.buildRequest(operation as never);

    expect(request.outputContract).toBe('client-derivation-v3');
    expect((request.parts[0] as { text: string }).text).toContain(
      'What the client asked for',
    );
    expect((request.parts[0] as { text: string }).text).toContain('reassuring');
  });

  it('publishes atomically once every section of the release is ready', async () => {
    const { prisma, handler, proposal, operation } = setup();
    prisma.sectionProposal.findUnique.mockResolvedValue(proposal);
    prisma.clientSectionContent.upsert.mockResolvedValue({ id: 'content' });
    prisma.clientContentRelease.findUnique.mockResolvedValue({
      id: releaseId,
      baseReleaseId: null,
      expectedSectionCount: 1,
      status: 'preparing',
      entries: [{}],
    });
    // The head moves by conditional swap, not by read-then-write: four sections
    // approved seconds apart each read the same head and two of them published,
    // leaving the client two live releases covering half the sections.
    prisma.projectClientPublication.updateMany.mockResolvedValue({ count: 1 });

    await handler.apply(asPrismaService(prisma), operation as never, {
      output: {
        promptVersion: 'client-derivation-v3',
        locale: 'fr',
        blocks: [{ type: 'open_point', text: 'TBD', openPointId: openId }],
      },
    });

    expect(prisma.clientSectionContent.upsert).toHaveBeenCalled();
    expect(prisma.projectClientPublication.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ currentReleaseId: null }),
        data: expect.objectContaining({ currentReleaseId: releaseId }),
      }),
    );
  });

  it('preserves the current release when a candidate base became stale', async () => {
    const { prisma, handler, proposal, operation } = setup();
    prisma.sectionProposal.findUnique.mockResolvedValue(proposal);
    prisma.clientSectionContent.upsert.mockResolvedValue({ id: 'content' });
    prisma.clientContentRelease.findUnique.mockResolvedValue({
      id: releaseId,
      baseReleaseId: 'old',
      expectedSectionCount: 1,
      status: 'preparing',
      entries: [{}],
    });
    // The swap finds the head already moved on: this release was built from a
    // version of the truth that is no longer current.
    prisma.projectClientPublication.updateMany.mockResolvedValue({ count: 0 });

    await handler.apply(asPrismaService(prisma), operation as never, {
      output: {
        promptVersion: 'client-derivation-v3',
        locale: 'fr',
        blocks: [{ type: 'open_point', text: 'TBD', openPointId: openId }],
      },
    });

    expect(prisma.clientContentRelease.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'superseded' } }),
    );
    expect(prisma.clientContentRelease.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'published' }),
      }),
    );
  });

  it('rejects missing links, an unapproved proposal, and lost open points', async () => {
    const { prisma, handler, proposal, operation } = setup();

    await expect(handler.buildRequest({} as never)).rejects.toThrow(
      'LINKS_MISSING',
    );

    // A proposal the contributor has not approved must never reach the client.
    prisma.sectionProposal.findUnique.mockResolvedValue({
      ...proposal,
      status: 'pending_review',
    });
    await expect(handler.buildRequest(operation as never)).rejects.toThrow(
      'INPUT_MISSING',
    );

    prisma.sectionProposal.findUnique.mockResolvedValue(proposal);
    await expect(
      handler.apply(asPrismaService(prisma) as never, operation as never, {
        output: {
          promptVersion: 'client-derivation-v3',
          locale: 'fr',
          blocks: [],
        },
      }),
    ).rejects.toThrow('OPEN_POINT_COVERAGE');
  });
});
