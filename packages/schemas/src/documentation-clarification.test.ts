import { describe, expect, it } from "vitest";
import {
  ClarificationPageSchema,
  ResolveClarificationsRequestSchema,
  ResolveClarificationsResponseSchema,
} from "./documentation-clarification";

const id = (suffix: number) =>
  `00000000-0000-4000-8000-${suffix.toString().padStart(12, "0")}`;

describe("documentation clarifications", () => {
  it("keeps ranked evidence, optimistic versions, and stable open-point IDs", () => {
    expect(
      ClarificationPageSchema.parse({
        items: [
          {
            id: id(1),
            question: "Quelle date de lancement faut-il communiquer ?",
            impactRank: 1,
            impactExplanation: "La date apparaît dans le planning client.",
            status: "open",
            version: 2,
            detectedInRevisionId: id(2),
            informationItemIds: [id(3)],
            openPointBlockId: id(4),
            evidence: [
              {
                kind: "document",
                originId: id(5),
                label: "Planning.pdf",
                excerpt: "Lancement le 12 septembre",
                locator: { type: "pdf_page", page: 2, excerpt: "Lancement le 12 septembre" },
              },
            ],
            createdAt: "2026-08-11T10:00:00.000Z",
          },
        ],
        total: 7,
        nextCursor: "next",
      }).total,
    ).toBe(7);
  });

  it("accepts mixed answer and leave-open batches with a version per decision", () => {
    expect(
      ResolveClarificationsRequestSchema.parse({
        expectedSourceRevisionId: id(9),
        resolutions: [
          { clarificationId: id(1), expectedVersion: 2, action: "answer", answer: "19 septembre" },
          { clarificationId: id(6), expectedVersion: 1, action: "leave_open" },
        ],
      }).resolutions,
    ).toHaveLength(2);
    expect(() =>
      ResolveClarificationsRequestSchema.parse({
        expectedSourceRevisionId: id(9),
        resolutions: [{ clarificationId: id(1), expectedVersion: 1, action: "answer" }],
      }),
    ).toThrow();
  });

  it("returns every resolution and the new revision only when facts changed", () => {
    expect(
      ResolveClarificationsResponseSchema.parse({
        items: [
          { clarificationId: id(1), status: "answered", version: 3, openPointBlockId: id(4) },
          { clarificationId: id(6), status: "left_open", version: 2, openPointBlockId: id(7) },
        ],
        sourceRevisionId: id(8),
      }).sourceRevisionId,
    ).toBe(id(8));
  });
});
