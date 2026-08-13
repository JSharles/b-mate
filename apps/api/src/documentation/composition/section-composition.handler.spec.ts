import type { GenerationOperation } from '@prisma/client';
import { GenerationHandlerRegistry } from '../../generation/generation-handler.registry';
import { asPrismaService, createPrismaMock } from '../../test/prisma-mock';
import {
  SECTION_COMPOSITION_PROMPT_VERSION,
  SectionCompositionOutputSchema,
} from './composition-output.schema';
import {
  SectionCompositionHandler,
  compositionFingerprint,
  compositionParts,
} from './section-composition.handler';

const operationId = '00000000-0000-4000-8000-0000000000aa';
const sectionId = '00000000-0000-4000-8000-000000000001';
const proposalId = '00000000-0000-4000-8000-000000000002';
const referenceId = '00000000-0000-4000-8000-000000000003';

const structuredContent = [
  {
    title: 'Scope',
    documentTitles: ['Statement of work'],
    blocks: [
      { kind: 'paragraph', text: 'The launch is planned for October.' },
      { kind: 'gap', text: 'The budget is not stated.', pointId: 'p0' },
    ],
  },
];

const section = {
  id: sectionId,
  kind: 'prose' as const,
  name: 'What the client asked for',
  instructions: 'Everything about the request and the constraints we found.',
  archivedAt: null,
};

const referenceDocument = { id: referenceId, version: 2, structuredContent };
const locale = 'fr';

function fingerprint(overrides: Record<string, unknown> = {}) {
  return compositionFingerprint({
    locale,
    sectionId,
    sectionKind: section.kind,
    sectionName: section.name,
    instructions: section.instructions,
    referenceDocumentId: referenceId,
    referenceVersion: 2,
    ...overrides,
  });
}

function operation(): GenerationOperation {
  return {
    id: operationId,
    inputFingerprint: fingerprint(),
  } as GenerationOperation;
}

function output(overrides: Record<string, unknown> = {}) {
  return SectionCompositionOutputSchema.parse({
    promptVersion: SECTION_COMPOSITION_PROMPT_VERSION,
    outcome: 'composed',
    blocks: [{ kind: 'paragraph', text: 'The launch is planned for October.' }],
    changeSummary: 'First composition.',
    ...overrides,
  });
}

describe('SectionCompositionHandler', () => {
  function setup() {
    const prisma = createPrismaMock();
    const registry = new GenerationHandlerRegistry();
    return {
      prisma,
      registry,
      handler: new SectionCompositionHandler(asPrismaService(prisma), registry),
    };
  }

  function composing(overrides: Record<string, unknown> = {}) {
    return {
      id: proposalId,
      sectionId,
      referenceDocumentId: referenceId,
      locale,
      status: 'composing',
      section,
      referenceDocument,
      ...overrides,
    };
  }

  describe('preparing the document for the model', () => {
    // A gap keeps its own kind, so the section can carry it forward as an open
    // point instead of quietly writing a sentence that reads as settled.
    it('keeps a gap apart from a paragraph', () => {
      expect(compositionParts(structuredContent)[0].blocks).toEqual([
        { kind: 'paragraph', text: 'The launch is planned for October.' },
        { kind: 'gap', text: 'The budget is not stated.' },
      ]);
    });

    it('answers for a document with no parts at all', () => {
      expect(compositionParts(null)).toEqual([]);
    });
  });

  describe('building the request', () => {
    it('carries the section brief and the reference document', async () => {
      const { prisma, handler } = setup();
      prisma.sectionProposal.findUnique.mockResolvedValue(composing());

      const request = await handler.buildRequest(operation());
      const text = (request.parts[0] as { text: string }).text;

      expect(text).toContain('What the client asked for');
      expect(text).toContain('Everything about the request');
      expect(text).toContain('The launch is planned for October.');
      expect(request.outputContract).toBe('section-composition-v3');
    });

    // The developer reads this before publishing anything, so it is written in
    // their language. It used to be English whatever they read the product in.
    it('writes in the language the composition was queued in', async () => {
      const { prisma, handler } = setup();
      prisma.sectionProposal.findUnique.mockResolvedValue(composing());

      const request = await handler.buildRequest(operation());

      expect((request.parts[0] as { text: string }).text).toContain(
        'Write in French',
      );
    });

    it('refuses a proposal that is no longer composing', async () => {
      const { prisma, handler } = setup();
      prisma.sectionProposal.findUnique.mockResolvedValue(
        composing({ status: 'superseded' }),
      );

      await expect(handler.buildRequest(operation())).rejects.toThrow(
        'SECTION_COMPOSITION_NOT_CURRENT',
      );
    });

    it('refuses to compose for a section archived while it waited', async () => {
      const { prisma, handler } = setup();
      prisma.sectionProposal.findUnique.mockResolvedValue(
        composing({ section: { ...section, archivedAt: new Date() } }),
      );

      await expect(handler.buildRequest(operation())).rejects.toThrow(
        'SECTION_COMPOSITION_NOT_CURRENT',
      );
    });

    // A rewrite between queueing and running changes what the section would be
    // composed from, so the work is refused rather than done against a document
    // nobody asked for.
    it('refuses when the reference document was rewritten under it', async () => {
      const { prisma, handler } = setup();
      prisma.sectionProposal.findUnique.mockResolvedValue(
        composing({ referenceDocument: { ...referenceDocument, version: 3 } }),
      );

      await expect(handler.buildRequest(operation())).rejects.toThrow(
        'SECTION_COMPOSITION_INPUT_DRIFT',
      );
    });

    it('refuses when the section brief changed under a queued composition', async () => {
      const { prisma, handler } = setup();
      prisma.sectionProposal.findUnique.mockResolvedValue(
        composing({
          section: { ...section, instructions: 'Something else entirely.' },
        }),
      );

      await expect(handler.buildRequest(operation())).rejects.toThrow(
        'SECTION_COMPOSITION_INPUT_DRIFT',
      );
    });
  });

  describe('applying a result', () => {
    it('leaves the proposal awaiting review and clears the refresh mark', async () => {
      const { prisma, handler } = setup();
      prisma.sectionProposal.findUnique.mockResolvedValue(composing());

      await handler.apply(prisma as never, operation(), { output: output() });

      expect(prisma.sectionProposal.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'pending_review',
            outcome: 'composed',
          }),
        }),
      );
      expect(prisma.clientSection.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: sectionId },
          data: expect.objectContaining({ refreshNeeded: false }),
        }),
      );
    });

    it('records a composition that found nothing, without inventing content', async () => {
      const { prisma, handler } = setup();
      prisma.sectionProposal.findUnique.mockResolvedValue(composing());

      await handler.apply(prisma as never, operation(), {
        output: output({ outcome: 'nothing_matched', blocks: [] }),
      });

      expect(prisma.sectionProposal.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            outcome: 'nothing_matched',
            structuredContent: [],
          }),
        }),
      );
    });

    it('refuses a result for a proposal that has moved on', async () => {
      const { prisma, handler } = setup();
      prisma.sectionProposal.findUnique.mockResolvedValue(
        composing({ status: 'superseded' }),
      );

      await expect(
        handler.apply(prisma as never, operation(), { output: output() }),
      ).rejects.toThrow('SECTION_COMPOSITION_NOT_CURRENT');
    });
  });

  describe('when the generation dies', () => {
    it('fails the proposal and hands the section its slot back', async () => {
      const { prisma, handler } = setup();
      prisma.sectionProposal.findFirst.mockResolvedValue({
        id: proposalId,
        sectionId,
      });

      await handler.onTerminalFailure(
        prisma as never,
        operation(),
        'PROVIDER_TIMEOUT',
      );

      expect(prisma.sectionProposal.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed',
            failureCode: 'PROVIDER_TIMEOUT',
          }),
        }),
      );
      expect(prisma.clientSection.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: sectionId, activeProposalId: proposalId },
          data: expect.objectContaining({ activeProposalId: null }),
        }),
      );
    });

    it('does nothing when the proposal already reached an end', async () => {
      const { prisma, handler } = setup();
      prisma.sectionProposal.findFirst.mockResolvedValue(null);

      await handler.onTerminalFailure(
        prisma as never,
        operation(),
        'PROVIDER_TIMEOUT',
      );

      expect(prisma.sectionProposal.update).not.toHaveBeenCalled();
      expect(prisma.clientSection.updateMany).not.toHaveBeenCalled();
    });
  });

  it('registers itself for its stage', () => {
    const { registry, handler } = setup();
    handler.onModuleInit();

    expect(registry.get('section_composition')).toBe(handler);
  });

  // A roadmap runs on the same slot, lease and terminal-failure release; only
  // what it asks for and what comes back differ.
  describe('a roadmap section', () => {
    const roadmapSection = {
      ...section,
      kind: 'roadmap' as const,
      instructions: null,
    };

    function composingRoadmap() {
      return {
        id: proposalId,
        sectionId,
        referenceDocumentId: referenceId,
        locale,
        status: 'composing',
        section: roadmapSection,
        referenceDocument,
      };
    }

    function roadmapOperation(): GenerationOperation {
      return {
        id: operationId,
        inputFingerprint: fingerprint({
          sectionKind: 'roadmap',
          instructions: null,
        }),
      } as GenerationOperation;
    }

    it('asks for a timeline and never mentions a register', async () => {
      const { prisma, handler } = setup();
      prisma.sectionProposal.findUnique.mockResolvedValue(composingRoadmap());

      const request = await handler.buildRequest(roadmapOperation());
      const text = (request.parts[0] as { text: string }).text;

      expect(request.outputContract).toBe('roadmap-composition-v2');
      expect(text).toContain('timeline');
      // Only what the document names, never a phase broken down because
      // breaking phases down is usual.
      expect(text).toContain('substeps');
      expect(text).toContain('The launch is planned for October.');
      // The standard phases are offered to the developer, never handed to the
      // model as an arc to fill.
      expect(text).not.toContain('Recette');
    });

    // Ids have to survive the developer's edits and the derivation that
    // follows, and a model copying a uuid back is the failure 45a13ac removed.
    it('mints an id for every milestone rather than asking for one', async () => {
      const { prisma, handler } = setup();
      prisma.sectionProposal.findUnique.mockResolvedValue(composingRoadmap());
      prisma.sectionProposal.update.mockResolvedValue({});
      prisma.clientSection.update.mockResolvedValue({});

      await handler.apply(asPrismaService(prisma), operation(), {
        output: {
          promptVersion: 'roadmap-composition-v2',
          outcome: 'composed',
          milestones: [
            {
              when: 'Q3 2026',
              title: 'Développement',
              description: null,
              substeps: [
                { when: null, title: 'Feature 1', description: null },
                { when: 'juillet', title: 'Feature 2', description: null },
              ],
            },
            {
              when: 'après la recette',
              title: 'Mise en ligne',
              description: 'Go live.',
              substeps: [],
            },
          ],
          changeSummary: 'First roadmap.',
        },
      });

      const written = prisma.sectionProposal.update.mock.calls[0][0] as {
        data: {
          structuredContent: {
            id: string;
            origin: string;
            when: string;
            substeps: { id: string; origin: string; when: string | null }[];
          }[];
        };
      };
      expect(written.data.structuredContent).toHaveLength(2);
      expect(written.data.structuredContent[0].id).toMatch(/^[0-9a-f-]{36}$/);
      expect(written.data.structuredContent[0].origin).toBe('document');
      expect(written.data.structuredContent[1].when).toBe('après la recette');
      // Both levels get an id, and neither was asked of the model.
      const substeps = written.data.structuredContent[0].substeps;
      expect(substeps).toHaveLength(2);
      expect(substeps[0].id).toMatch(/^[0-9a-f-]{36}$/);
      expect(substeps[0].id).not.toBe(written.data.structuredContent[0].id);
      expect(substeps[0].when).toBeNull();
      expect(substeps[0].origin).toBe('document');
    });
  });
});
