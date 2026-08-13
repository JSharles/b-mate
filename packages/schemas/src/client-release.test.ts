import { describe, expect, it } from "vitest";
import { PublicClientSectionSchema } from "./client-release";

const id = "123e4567-e89b-42d3-a456-426614174000";
const milestoneId = "123e4567-e89b-42d3-a456-426614174001";

describe("client release contracts", () => {
  it("rejects internal identifiers in public serialization", () => {
    expect(
      PublicClientSectionSchema.safeParse({
        kind: "prose",
        id,
        name: "Le projet",
        blocks: [],
        sourceRevisionId: "internal",
      }).success,
    ).toBe(false);
  });

  // Discriminated rather than inferred from which key is present: the renderer
  // should not have to consult the section list to know what it is holding.
  it("says whether it is prose or a roadmap", () => {
    const roadmap = PublicClientSectionSchema.parse({
      kind: "roadmap",
      id,
      name: "Roadmap",
      milestones: [
        {
          id: milestoneId,
          when: "Q3 2026",
          title: "Recette",
          description: null,
        },
      ],
      currentMilestoneId: milestoneId,
    });

    expect(roadmap.kind).toBe("roadmap");
    expect(roadmap.kind === "roadmap" && roadmap.currentMilestoneId).toBe(
      milestoneId,
    );
  });

  // Where a milestone came from is the developer's business, not the client's:
  // by the time it is published, both are the developer's word.
  it("never tells the client which milestones were added by hand", () => {
    expect(
      PublicClientSectionSchema.safeParse({
        kind: "roadmap",
        id,
        name: "Roadmap",
        milestones: [
          {
            id: milestoneId,
            when: "Q3 2026",
            title: "Recette",
            description: null,
            origin: "developer",
          },
        ],
        currentMilestoneId: null,
      }).success,
    ).toBe(false);
  });

  // A plan with no position claimed reads better than one that defaults to its
  // first step.
  it("accepts a roadmap claiming no position", () => {
    expect(
      PublicClientSectionSchema.parse({
        kind: "roadmap",
        id,
        name: "Roadmap",
        milestones: [],
        currentMilestoneId: null,
      }).kind,
    ).toBe("roadmap");
  });
});
