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
      // `kind`, as composition writes it. The coverage check below read `type`
      // and so never fired — a prose section could lose every open point on its
      // way to the client and nothing noticed.
      structuredContent: [
        { kind: 'open_point', openPointId: openId, text: 'TBD' },
      ],
      // Register travels on the section, not on a project-wide profile.
      section: {
        kind: 'prose',
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

    expect(request.outputContract).toBe('client-derivation-v4');
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
        promptVersion: 'client-derivation-v4',
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
        promptVersion: 'client-derivation-v4',
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
          promptVersion: 'client-derivation-v4',
          locale: 'fr',
          blocks: [],
        },
      }),
    ).rejects.toThrow('OPEN_POINT_COVERAGE');
  });

  // FR-013: this call puts the milestones in the client's language and does
  // nothing else. The developer wrote or corrected these by hand.
  describe('a roadmap section', () => {
    const milestoneId = '00000000-0000-4000-8000-000000000005';

    function roadmapProposal() {
      return {
        id: proposalId,
        sectionId,
        status: 'approved',
        structuredContent: [
          {
            id: milestoneId,
            when: 'Q3 2026',
            title: 'Recette',
            description: null,
          },
        ],
        section: { kind: 'roadmap', name: 'Roadmap' },
      };
    }

    it("asks for the same milestones in the client's language", async () => {
      const { prisma, handler, operation } = setup();
      prisma.sectionProposal.findUnique.mockResolvedValue(roadmapProposal());

      const request = await handler.buildRequest(operation as never);

      expect(request.outputContract).toBe('roadmap-derivation-v2');
      expect((request.parts[0] as { text: string }).text).toContain('Q3 2026');
      // No register: a roadmap has none, and asking for one would invent it.
      expect((request.parts[0] as { text: string }).text).not.toContain(
        'Register',
      );
    });

    it('keeps its own ids rather than trusting the ones it gets back', async () => {
      const { prisma, handler, operation } = setup();
      prisma.sectionProposal.findUnique.mockResolvedValue(roadmapProposal());
      prisma.clientSectionContent.upsert.mockResolvedValue({ id: 'content' });
      prisma.clientContentRelease.findUnique.mockResolvedValue({
        id: releaseId,
        status: 'preparing',
        expectedSectionCount: 2,
        entries: [{}],
      });

      await handler.apply(asPrismaService(prisma), operation as never, {
        output: {
          promptVersion: 'roadmap-derivation-v2',
          locale: 'fr',
          milestones: [
            {
              when: 'Q3 2026',
              title: 'Acceptance testing',
              description: null,
              substeps: [],
            },
          ],
        },
      });

      const written = prisma.clientSectionContent.upsert.mock.calls[0][0] as {
        create: { structuredContent: { id: string; title: string }[] };
      };
      expect(written.create.structuredContent[0].id).toBe(milestoneId);
      expect(written.create.structuredContent[0].title).toBe(
        'Acceptance testing',
      );
    });

    // A roadmap that lost or gained a step fails the operation rather than
    // reaching the client short.
    it('refuses a derivation that returns a different number of milestones', async () => {
      const { prisma, handler, operation } = setup();
      prisma.sectionProposal.findUnique.mockResolvedValue(roadmapProposal());

      await expect(
        handler.apply(asPrismaService(prisma), operation as never, {
          output: {
            promptVersion: 'roadmap-derivation-v2',
            locale: 'fr',
            milestones: [],
          },
        }),
      ).rejects.toThrow('MILESTONE_COUNT');
    });

    // A roadmap that loses a feature on its way to the client is a roadmap that
    // lies about what is being built.
    it('refuses a derivation that loses a step inside a milestone', async () => {
      const { prisma, handler, operation } = setup();
      prisma.sectionProposal.findUnique.mockResolvedValue({
        ...roadmapProposal(),
        structuredContent: [
          {
            id: milestoneId,
            when: 'Q3 2026',
            title: 'Développement',
            description: null,
            substeps: [
              {
                id: 'sub-1',
                when: null,
                title: 'Feature 1',
                description: null,
              },
              {
                id: 'sub-2',
                when: null,
                title: 'Feature 2',
                description: null,
              },
            ],
          },
        ],
      });

      await expect(
        handler.apply(asPrismaService(prisma), operation as never, {
          output: {
            promptVersion: 'roadmap-derivation-v2',
            locale: 'fr',
            milestones: [
              {
                when: 'Q3 2026',
                title: 'Build',
                description: null,
                substeps: [
                  { when: null, title: 'Feature 1', description: null },
                ],
              },
            ],
          },
        }),
      ).rejects.toThrow('MILESTONE_COUNT');
    });

    it('keeps its own ids for the steps inside a milestone too', async () => {
      const { prisma, handler, operation } = setup();
      prisma.sectionProposal.findUnique.mockResolvedValue({
        ...roadmapProposal(),
        structuredContent: [
          {
            id: milestoneId,
            when: 'Q3 2026',
            title: 'Développement',
            description: null,
            substeps: [
              {
                id: 'sub-1',
                when: null,
                title: 'Feature 1',
                description: null,
              },
            ],
          },
        ],
      });
      prisma.clientSectionContent.upsert.mockResolvedValue({ id: 'content' });
      prisma.clientContentRelease.findUnique.mockResolvedValue({
        id: releaseId,
        status: 'preparing',
        expectedSectionCount: 2,
        entries: [{}],
      });

      await handler.apply(asPrismaService(prisma), operation as never, {
        output: {
          promptVersion: 'roadmap-derivation-v2',
          locale: 'fr',
          milestones: [
            {
              when: 'Q3 2026',
              title: 'Build',
              description: null,
              // A substep with no date keeps none, whatever the model returns.
              substeps: [
                { when: null, title: 'The basket', description: null },
              ],
            },
          ],
        },
      });

      const written = prisma.clientSectionContent.upsert.mock.calls[0][0] as {
        create: {
          structuredContent: {
            substeps: { id: string; title: string; when: string | null }[];
          }[];
        };
      };
      expect(written.create.structuredContent[0].substeps[0]).toMatchObject({
        id: 'sub-1',
        title: 'The basket',
        when: null,
      });
    });
  });
});
