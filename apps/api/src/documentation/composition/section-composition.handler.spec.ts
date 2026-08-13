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
  selectCompositionStatements,
} from './section-composition.handler';

const operationId = '00000000-0000-4000-8000-0000000000aa';
const sectionId = '00000000-0000-4000-8000-000000000001';
const proposalId = '00000000-0000-4000-8000-000000000002';
const revisionId = '00000000-0000-4000-8000-000000000003';
const itemA = '00000000-0000-4000-8000-00000000000a';
const itemB = '00000000-0000-4000-8000-00000000000b';

const revisionItems = [
  {
    informationItemId: itemA,
    kind: 'fact' as const,
    state: 'confirmed' as const,
    content: 'The launch is planned for October.',
  },
  {
    informationItemId: itemB,
    kind: 'constraint' as const,
    state: 'confirmed' as const,
    content: 'The budget is capped at 40k.',
  },
];

const section = {
  id: sectionId,
  name: 'What the client asked for',
  instructions: 'Everything about the request and the constraints we found.',
  archivedAt: null,
};

function fingerprint() {
  return compositionFingerprint({
    sectionId,
    sectionName: section.name,
    instructions: section.instructions,
    sourceRevisionId: revisionId,
    statements: selectCompositionStatements(revisionItems),
  });
}

function operation(
  overrides: Partial<GenerationOperation> = {},
): GenerationOperation {
  return {
    id: operationId,
    inputFingerprint: fingerprint(),
    ...overrides,
  } as GenerationOperation;
}

function output(overrides: Record<string, unknown> = {}) {
  return SectionCompositionOutputSchema.parse({
    promptVersion: SECTION_COMPOSITION_PROMPT_VERSION,
    outcome: 'composed',
    blocks: [
      {
        type: 'fact',
        text: 'The launch is planned for October.',
        informationItemIds: [itemA],
      },
    ],
    questions: [],
    changeSummary: 'First composition.',
    provenanceSummary: [{ label: 'Statement of work', itemCount: 1 }],
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

  describe('selecting the input', () => {
    it('sends every statement when nothing is excluded', () => {
      expect(
        selectCompositionStatements(revisionItems).map((s) => s.id),
      ).toEqual([itemA, itemB]);
    });

    it('removes an excluded statement before the model sees it', () => {
      const selected = selectCompositionStatements(
        revisionItems,
        new Set([itemB]),
      );

      expect(selected.map((s) => s.id)).toEqual([itemA]);
    });
  });

  describe('building the request', () => {
    it('carries the section brief and the statements', async () => {
      const { prisma, handler } = setup();
      prisma.sectionProposal.findUnique.mockResolvedValue({
        id: proposalId,
        sectionId,
        sourceRevisionId: revisionId,
        status: 'composing',
        section,
        sourceRevision: { items: revisionItems },
      });

      const request = await handler.buildRequest(operation());
      const text = (request.parts[0] as { text: string }).text;

      expect(text).toContain('What the client asked for');
      expect(text).toContain('Everything about the request');
      expect(text).toContain('The budget is capped at 40k.');
      expect(request.outputContract).toBe('section-composition-v1');
    });

    // The fingerprint is taken over the statements in order. The service reads
    // them sorted; an unsorted read here produced a different fingerprint and the
    // stage refused its own input as drift — on the very first real run.
    it('reads the statements in the order the service recorded them', async () => {
      const { prisma, handler } = setup();
      prisma.sectionProposal.findUnique.mockResolvedValue({
        id: proposalId,
        sectionId,
        sourceRevisionId: revisionId,
        status: 'composing',
        section,
        sourceRevision: { items: revisionItems },
      });

      await handler.buildRequest(operation());

      expect(prisma.sectionProposal.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            sourceRevision: {
              include: { items: { orderBy: { sortOrder: 'asc' } } },
            },
          }),
        }),
      );
    });

    it('refuses a proposal that is no longer composing', async () => {
      const { prisma, handler } = setup();
      prisma.sectionProposal.findUnique.mockResolvedValue({
        id: proposalId,
        sectionId,
        sourceRevisionId: revisionId,
        status: 'superseded',
        section,
        sourceRevision: { items: revisionItems },
      });

      await expect(handler.buildRequest(operation())).rejects.toThrow(
        'SECTION_COMPOSITION_NOT_CURRENT',
      );
    });

    it('refuses to compose for a section archived while it waited', async () => {
      const { prisma, handler } = setup();
      prisma.sectionProposal.findUnique.mockResolvedValue({
        id: proposalId,
        sectionId,
        sourceRevisionId: revisionId,
        status: 'composing',
        section: { ...section, archivedAt: new Date() },
        sourceRevision: { items: revisionItems },
      });

      await expect(handler.buildRequest(operation())).rejects.toThrow(
        'SECTION_COMPOSITION_NOT_CURRENT',
      );
    });

    it('refuses when the source moved under a queued composition', async () => {
      const { prisma, handler } = setup();
      prisma.sectionProposal.findUnique.mockResolvedValue({
        id: proposalId,
        sectionId,
        sourceRevisionId: revisionId,
        status: 'composing',
        section,
        sourceRevision: { items: [revisionItems[0]] },
      });

      await expect(handler.buildRequest(operation())).rejects.toThrow(
        'SECTION_COMPOSITION_INPUT_DRIFT',
      );
    });

    it('refuses when the section brief changed under a queued composition', async () => {
      const { prisma, handler } = setup();
      prisma.sectionProposal.findUnique.mockResolvedValue({
        id: proposalId,
        sectionId,
        sourceRevisionId: revisionId,
        status: 'composing',
        section: { ...section, instructions: 'Something else entirely.' },
        sourceRevision: { items: revisionItems },
      });

      await expect(handler.buildRequest(operation())).rejects.toThrow(
        'SECTION_COMPOSITION_INPUT_DRIFT',
      );
    });
  });

  describe('applying a result', () => {
    function composingProposal() {
      return {
        id: proposalId,
        sectionId,
        status: 'composing',
        sourceRevision: { items: revisionItems },
      };
    }

    it('leaves the proposal awaiting review and clears the refresh mark', async () => {
      const { prisma, handler } = setup();
      prisma.sectionProposal.findUnique.mockResolvedValue(composingProposal());

      await handler.apply(prisma as never, operation(), {
        output: output(),
      });

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
      prisma.sectionProposal.findUnique.mockResolvedValue(composingProposal());

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

    it('writes questions as rows beside the content', async () => {
      const { prisma, handler } = setup();
      prisma.sectionProposal.findUnique.mockResolvedValue(composingProposal());
      prisma.sectionQuestion.create.mockResolvedValue({ id: 'question-1' });

      await handler.apply(prisma as never, operation(), {
        output: output({
          questions: [
            {
              question: 'Is the October date confirmed?',
              impactExplanation: 'The client would read an unconfirmed date.',
              informationItemIds: [itemA],
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
      expect(prisma.sectionQuestionItem.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [{ questionId: 'question-1', informationItemId: itemA }],
        }),
      );
    });

    it('refuses a result citing a statement it was never given', async () => {
      const { prisma, handler } = setup();
      prisma.sectionProposal.findUnique.mockResolvedValue({
        ...composingProposal(),
        sourceRevision: { items: [revisionItems[1]] },
      });

      await expect(
        handler.apply(prisma as never, operation(), {
          output: output(),
        }),
      ).rejects.toThrow('SECTION_COMPOSITION_UNKNOWN_REFERENCE');
      expect(prisma.sectionProposal.update).not.toHaveBeenCalled();
    });

    it('refuses a result for a proposal that has moved on', async () => {
      const { prisma, handler } = setup();
      prisma.sectionProposal.findUnique.mockResolvedValue({
        ...composingProposal(),
        status: 'superseded',
      });

      await expect(
        handler.apply(prisma as never, operation(), {
          output: output(),
        }),
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
