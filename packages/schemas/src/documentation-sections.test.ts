import { describe, expect, it } from "vitest";
import {
  ApproveSectionProposalRequestSchema,
  CreateSectionExclusionRequestSchema,
  CreateSectionRequestSchema,
  PublicSectionsViewSchema,
  ReorderSectionsRequestSchema,
  SectionContentBlockSchema,
  SectionProposalDetailSchema,
  SectionViewSchema,
  UpdateSectionRequestSchema,
} from "./documentation-sections";

const id = "123e4567-e89b-42d3-a456-426614174000";
const otherId = "123e4567-e89b-42d3-a456-426614174001";

const editorial = {
  length: "balanced",
  pedagogy: "guided",
  technicalFamiliarity: "novice",
  tone: "reassuring",
} as const;

describe("creating a section", () => {
  it("accepts a name, instructions and the four editorial dimensions", () => {
    const parsed = CreateSectionRequestSchema.parse({
      name: "  Ce que le client a demandé  ",
      instructions: "Tout ce qui concerne la demande initiale et ses contraintes.",
      editorial,
    });

    expect(parsed.name).toBe("Ce que le client a demandé");
    expect(parsed.editorial.tone).toBe("reassuring");
  });

  it("refuses a section with no instructions, since instructions are what compose it", () => {
    expect(
      CreateSectionRequestSchema.safeParse({
        name: "Vue d'ensemble",
        instructions: "   ",
        editorial,
      }).success,
    ).toBe(false);
  });

  it("refuses a category key or any other leftover taxonomy field", () => {
    expect(
      CreateSectionRequestSchema.safeParse({
        name: "Vue d'ensemble",
        instructions: "Ce que le projet est.",
        editorial,
        categoryKey: "overview",
      }).success,
    ).toBe(false);
  });
});

describe("updating a section", () => {
  it("allows a rename alone", () => {
    expect(
      UpdateSectionRequestSchema.safeParse({
        name: "Planning",
        expectedVersion: 3,
      }).success,
    ).toBe(true);
  });

  it("refuses an update that changes nothing", () => {
    expect(
      UpdateSectionRequestSchema.safeParse({ expectedVersion: 3 }).success,
    ).toBe(false);
  });

  it("always carries an expected version, so a concurrent edit can be refused", () => {
    expect(
      UpdateSectionRequestSchema.safeParse({ name: "Planning" }).success,
    ).toBe(false);
  });
});

describe("reordering", () => {
  it("carries the full ordered set", () => {
    expect(
      ReorderSectionsRequestSchema.parse({ orderedSectionIds: [id, otherId] })
        .orderedSectionIds,
    ).toEqual([id, otherId]);
  });

  it("refuses a section listed twice", () => {
    expect(
      ReorderSectionsRequestSchema.safeParse({
        orderedSectionIds: [id, otherId, id],
      }).success,
    ).toBe(false);
  });

  it("refuses an empty order", () => {
    expect(
      ReorderSectionsRequestSchema.safeParse({ orderedSectionIds: [] }).success,
    ).toBe(false);
  });
});

describe("composed content", () => {
  it("requires a stable identifier on an open point", () => {
    expect(
      SectionContentBlockSchema.safeParse({
        type: "open_point",
        text: "À confirmer",
        informationItemIds: [id],
      }).success,
    ).toBe(false);
  });

  it("requires every block to name the statements it rests on", () => {
    expect(
      SectionContentBlockSchema.safeParse({
        type: "fact",
        text: "Le lancement est prévu en octobre.",
        informationItemIds: [],
      }).success,
    ).toBe(false);
  });

  it("keeps a proposal pinned to the canonical head it was composed from", () => {
    const proposal = SectionProposalDetailSchema.parse({
      id,
      sectionId: otherId,
      sourceRevisionId: id,
      status: "pending_review",
      version: 1,
      changeSummary: null,
      createdAt: new Date().toISOString(),
      outcome: "composed",
      blocks: [],
      questions: [],
      provenanceSummary: [],
      failureCode: null,
    });

    expect(proposal.sourceRevisionId).toBe(id);
  });

  it("can report that nothing in the source matched the instructions", () => {
    const proposal = SectionProposalDetailSchema.parse({
      id,
      sectionId: otherId,
      sourceRevisionId: id,
      status: "pending_review",
      version: 1,
      changeSummary: null,
      createdAt: new Date().toISOString(),
      outcome: "nothing_matched",
      blocks: [],
      questions: [],
      provenanceSummary: [],
      failureCode: null,
    });

    expect(proposal.outcome).toBe("nothing_matched");
    expect(proposal.blocks).toEqual([]);
  });

  it("carries unresolved questions beside the content, not inside it", () => {
    const proposal = SectionProposalDetailSchema.parse({
      id,
      sectionId: otherId,
      sourceRevisionId: id,
      status: "pending_review",
      version: 1,
      changeSummary: null,
      createdAt: new Date().toISOString(),
      outcome: "composed",
      blocks: [
        {
          type: "fact",
          text: "Le lancement est prévu en octobre.",
          informationItemIds: [id],
        },
      ],
      questions: [
        {
          id,
          question: "La date de lancement est-elle confirmée ?",
          impactExplanation: "Le client lira une date que rien ne confirme.",
          relatedInformationItemIds: [id],
          answeredByAssertionId: null,
        },
      ],
      provenanceSummary: [{ label: "Cahier des charges", itemCount: 4 }],
      failureCode: null,
    });

    expect(proposal.questions).toHaveLength(1);
    expect(proposal.blocks[0]?.text).toContain("octobre");
  });
});

describe("a section's state", () => {
  it("reports what the contributor needs to act on", () => {
    const view = SectionViewSchema.parse({
      id,
      name: "Ce que le client a demandé",
      instructions: "La demande initiale et ses contraintes.",
      editorial,
      sortOrder: 0,
      refreshNeeded: true,
      exclusionCount: 2,
      activeProposal: null,
      hasPublishedContent: false,
      version: 1,
    });

    expect(view.refreshNeeded).toBe(true);
    expect(view.hasPublishedContent).toBe(false);
  });
});

describe("excluding a statement from one section", () => {
  it("requires a reason", () => {
    expect(
      CreateSectionExclusionRequestSchema.safeParse({
        informationItemId: id,
      }).success,
    ).toBe(false);
  });

  it("accepts a statement and why it does not belong here", () => {
    expect(
      CreateSectionExclusionRequestSchema.parse({
        informationItemId: id,
        reason: "Trop technique pour cette section.",
      }).informationItemId,
    ).toBe(id);
  });
});

describe("approving", () => {
  it("carries the proposal version it saw", () => {
    expect(
      ApproveSectionProposalRequestSchema.safeParse({}).success,
    ).toBe(false);
    expect(
      ApproveSectionProposalRequestSchema.parse({ expectedVersion: 2 })
        .expectedVersion,
    ).toBe(2);
  });
});

describe("what the client reads", () => {
  it("carries authored names and derived content only", () => {
    const view = PublicSectionsViewSchema.parse({
      sections: [
        {
          id,
          name: "Ce que le client a demandé",
          content: {
            blocks: [{ kind: "paragraph", text: "Le projet démarre en mars." }],
          },
        },
      ],
    });

    expect(view.sections[0]?.name).toBe("Ce que le client a demandé");
  });

  it("never exposes the statements behind the content", () => {
    expect(
      PublicSectionsViewSchema.safeParse({
        sections: [
          {
            id,
            name: "Vue d'ensemble",
            content: {
              blocks: [
                {
                  kind: "paragraph",
                  text: "Le projet démarre en mars.",
                  informationItemIds: [id],
                },
              ],
            },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("accepts a project with nothing published yet", () => {
    expect(PublicSectionsViewSchema.parse({ sections: [] }).sections).toEqual(
      [],
    );
  });
});
