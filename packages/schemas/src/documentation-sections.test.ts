import { describe, expect, it } from "vitest";
import {
  ApproveSectionProposalRequestSchema,
  CreateSectionRequestSchema,
  PublicSectionsViewSchema,
  ReorderSectionsRequestSchema,
  MilestoneSchema,
  ReplaceMilestonesRequestSchema,
  SubstepSchema,
  SectionContentBlockSchema,
  SectionProposalDetailSchema,
  SectionViewSchema,
  SetCurrentMilestoneRequestSchema,
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
      kind: "prose",
      name: "  Ce que le client a demandé  ",
      instructions: "Tout ce qui concerne la demande initiale et ses contraintes.",
      editorial,
    });

    expect(parsed.name).toBe("Ce que le client a demandé");
    expect(parsed.kind === "prose" && parsed.editorial.tone).toBe("reassuring");
  });

  // Choosing a roadmap removes controls rather than adding them: its brief is
  // fixed — what the documents say about sequence — and a milestone date has no
  // tone, so there is nothing left to ask for but a name.
  it("accepts a roadmap carrying nothing but a name", () => {
    expect(
      CreateSectionRequestSchema.parse({ kind: "roadmap", name: "Roadmap" })
        .name,
    ).toBe("Roadmap");
  });

  it("refuses a roadmap that arrives with a brief or a register", () => {
    expect(
      CreateSectionRequestSchema.safeParse({
        kind: "roadmap",
        name: "Roadmap",
        instructions: "Les jalons.",
      }).success,
    ).toBe(false);
    expect(
      CreateSectionRequestSchema.safeParse({
        kind: "roadmap",
        name: "Roadmap",
        editorial,
      }).success,
    ).toBe(false);
  });

  it("refuses a section with no instructions, since instructions are what compose it", () => {
    expect(
      CreateSectionRequestSchema.safeParse({
        kind: "prose",
        name: "Vue d'ensemble",
        instructions: "   ",
        editorial,
      }).success,
    ).toBe(false);
  });

  it("refuses a category key or any other leftover taxonomy field", () => {
    expect(
      CreateSectionRequestSchema.safeParse({
        kind: "prose",
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
  function proposal(overrides: Record<string, unknown> = {}) {
    return {
      id,
      sectionId: otherId,
      referenceDocumentId: id,
      status: "pending_review",
      version: 1,
      changeSummary: null,
      createdAt: new Date().toISOString(),
      outcome: "composed",
      blocks: [{ kind: "paragraph", text: "Le lancement est prévu en octobre." }],
      // One of the two is always empty: the section's kind decides which.
      milestones: [],
      failureCode: null,
      ...overrides,
    };
  }

  // A section is a view of the reference document, so its blocks are shaped
  // like the document's — and nothing asks a model to echo an identifier back.
  it("carries prose, and no identifiers", () => {
    expect(
      SectionContentBlockSchema.parse({
        kind: "paragraph",
        text: "Le lancement est prévu en octobre.",
      }).kind,
    ).toBe("paragraph");
    expect(
      SectionContentBlockSchema.safeParse({
        kind: "paragraph",
        text: "Le lancement est prévu en octobre.",
        informationItemIds: [id],
      }).success,
    ).toBe(false);
  });

  // What the reference document leaves unsettled stays unsettled here rather
  // than being written around.
  it("keeps an open point as its own kind of block", () => {
    expect(
      SectionContentBlockSchema.parse({
        kind: "open_point",
        text: "La date n'est pas confirmée.",
      }).kind,
    ).toBe("open_point");
  });

  it("keeps a proposal pinned to the reference document it was composed from", () => {
    expect(SectionProposalDetailSchema.parse(proposal()).referenceDocumentId).toBe(
      id,
    );
  });

  // FR-011: a composition that matched nothing says so, rather than reaching
  // for unrelated material to avoid returning an empty set.
  it("can report that nothing in the document matched the instructions", () => {
    const parsed = SectionProposalDetailSchema.parse(
      proposal({ outcome: "nothing_matched", blocks: [] }),
    );

    expect(parsed.outcome).toBe("nothing_matched");
    expect(parsed.blocks).toEqual([]);
  });

});

describe("a section's state", () => {
  it("reports what the contributor needs to act on", () => {
    const view = SectionViewSchema.parse({
      id,
      kind: "prose",
      name: "Ce que le client a demandé",
      instructions: "La demande initiale et ses contraintes.",
      editorial,
      currentMilestoneId: null,
      sortOrder: 0,
      refreshNeeded: true,
      activeProposal: null,
      hasPublishedContent: false,
      version: 1,
    });

    expect(view.refreshNeeded).toBe(true);
    expect(view.hasPublishedContent).toBe(false);
  });

  // Null rather than a filled-in default: a roadmap was never given a brief or
  // a register, and saying so is what lets the screen not ask for one.
  it("says a roadmap has no brief and no register, rather than inventing them", () => {
    const view = SectionViewSchema.parse({
      id,
      kind: "roadmap",
      name: "Roadmap",
      instructions: null,
      editorial: null,
      currentMilestoneId: null,
      sortOrder: 1,
      refreshNeeded: false,
      activeProposal: null,
      hasPublishedContent: true,
      version: 3,
    });

    expect(view.editorial).toBeNull();
    expect(view.instructions).toBeNull();
  });
});

describe("a roadmap's milestones", () => {
  const substep = {
    id: otherId,
    when: null,
    title: "Feature 1 — le panier",
    description: null,
    origin: "document",
  };

  const milestone = {
    id,
    when: "Q3 2026",
    title: "Recette",
    description: null,
    substeps: [],
    origin: "document",
  };

  // Documents say "Q3 2026", "après la phase pilote", "mi-octobre". A date type
  // would either lose those or invent a precision they never gave.
  it("keeps when as text, worded as the document worded it", () => {
    expect(
      MilestoneSchema.parse({ ...milestone, when: "après la phase pilote" })
        .when,
    ).toBe("après la phase pilote");
  });

  it("refuses a milestone with no title — a marker over nothing", () => {
    expect(
      MilestoneSchema.safeParse({ ...milestone, title: "  " }).success,
    ).toBe(false);
  });

  // "Développement" is one word for three months. Naming what sits inside it is
  // the difference between a roadmap that informs and one that reassures.
  describe("what sits inside one", () => {
    // A feature inside a phase often has no date of its own, and inventing one
    // would be inventing.
    it("accepts a step with no date, and refuses one with no name", () => {
      expect(SubstepSchema.parse(substep).when).toBeNull();
      expect(
        SubstepSchema.safeParse({ ...substep, title: "   " }).success,
      ).toBe(false);
    });

    // The roadmap is two levels deep, and the ceiling is the type rather than a
    // rule someone has to remember.
    it("refuses a step carrying steps of its own", () => {
      expect(
        SubstepSchema.safeParse({ ...substep, substeps: [] }).success,
      ).toBe(false);
    });

    it("hangs them off the milestone that contains them", () => {
      const parsed = MilestoneSchema.parse({
        ...milestone,
        substeps: [substep],
      });

      expect(parsed.substeps).toHaveLength(1);
      expect(parsed.substeps[0].title).toBe("Feature 1 — le panier");
    });

    // The whole tree travels, both levels of it: an id names one being kept,
    // its absence mints a new one.
    it("lets the developer send back a step that has no id yet", () => {
      const parsed = ReplaceMilestonesRequestSchema.parse({
        milestones: [
          {
            id,
            when: "Q3 2026",
            title: "Développement",
            description: null,
            substeps: [
              { id: null, when: null, title: "Feature 2", description: null },
            ],
          },
        ],
        expectedProposalVersion: 4,
      });

      expect(parsed.milestones[0].substeps[0].id).toBeNull();
    });
  });

  // An id names a milestone being kept; its absence means a new one, which is
  // why a new milestone can never collide with an existing id.
  it("lets the developer send back a milestone that has no id yet", () => {
    const parsed = ReplaceMilestonesRequestSchema.parse({
      milestones: [
        {
          id: null,
          when: "novembre",
          title: "Mise en ligne",
          description: null,
          substeps: [],
        },
      ],
      expectedProposalVersion: 2,
    });

    expect(parsed.milestones[0].id).toBeNull();
  });

  it("refuses a set that names an origin the developer does not own", () => {
    expect(
      ReplaceMilestonesRequestSchema.safeParse({
        milestones: [{ ...milestone, origin: "document" }],
        expectedProposalVersion: 2,
      }).success,
    ).toBe(false);
  });

  // A plan with no position claimed is a real answer, and better than one
  // defaulting to its first step.
  it("accepts no position at all", () => {
    expect(
      SetCurrentMilestoneRequestSchema.parse({
        milestoneId: null,
        expectedVersion: 1,
      }).milestoneId,
    ).toBeNull();
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
