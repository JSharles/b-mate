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
  name: 'What the client asked for',
  instructions: 'Everything about the request and the constraints we found.',
  archivedAt: null,
};

const referenceDocument = { id: referenceId, version: 2, structuredContent };

function fingerprint(overrides: Record<string, unknown> = {}) {
  return compositionFingerprint({
    sectionId,
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
    questions: [],
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
      expect(request.outputContract).toBe('section-composition-v2');
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

    // FR-010: read apart from what is proposed, so the contributor can act on
    // one without touching the other.
    it('writes questions as rows beside the content', async () => {
      const { prisma, handler } = setup();
      prisma.sectionProposal.findUnique.mockResolvedValue(composing());
      prisma.sectionQuestion.create.mockResolvedValue({ id: 'question-1' });

      await handler.apply(prisma as never, operation(), {
        output: output({
          questions: [
            {
              question: 'Is the October date confirmed?',
              impactExplanation: 'The client would read an unconfirmed date.',
            },
          ],
        }),
      });

      expect(prisma.sectionQuestion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            proposalId,
            question: 'Is the October date confirmed?',
            sortOrder: 0,
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
});
