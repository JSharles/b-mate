import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useReferenceDocument, useWriteReferenceDocument } from "../hooks";
import { ReferenceDocumentView } from "./reference-document-view";

vi.mock("../hooks", () => ({
  useReferenceDocument: vi.fn(),
  useWriteReferenceDocument: vi.fn(),
}));
vi.mock("./provenance-sheet", () => ({
  ProvenanceSheet: () => <div>provenance</div>,
}));
vi.mock("./guided-correction-dialog", () => ({
  GuidedCorrectionDialog: ({ currentContent }: { currentContent: string }) => (
    <div>correction:{currentContent}</div>
  ),
}));

const write = { mutate: vi.fn(), isPending: false };
const itemA = "00000000-0000-4000-8000-00000000000a";

const ready = {
  id: "doc-1",
  sourceRevisionId: "revision-1",
  status: "ready",
  outcome: "written",
  locale: "fr",
  parts: [
    {
      title: "Le projet",
      blocks: [
        {
          kind: "paragraph",
          text: "Le produit rend un projet lisible pour un client.",
          informationItemIds: [itemA],
        },
      ],
    },
  ],
  citedStatements: [{ id: itemA, content: "The product makes a project legible." }],
  failureCode: null,
  createdAt: new Date().toISOString(),
  version: 2,
};

function withDocument(data: unknown, overrides: Record<string, unknown> = {}) {
  vi.mocked(useReferenceDocument).mockReturnValue({
    data,
    isPending: false,
    isError: false,
    ...overrides,
  } as never);
}

describe("ReferenceDocumentView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useWriteReferenceDocument).mockReturnValue(write as never);
  });

  // FR-002: named parts and continuous text, not one card per statement.
  it("reads as titled parts of continuous text", () => {
    withDocument(ready);

    render(<ReferenceDocumentView projectId="project-1" />);

    expect(screen.getByRole("heading", { name: "Le projet" })).toBeVisible();
    expect(
      screen.getByText("Le produit rend un projet lisible pour un client."),
    ).toBeVisible();
  });

  it("offers to write it when none exists", async () => {
    withDocument(null);
    const user = userEvent.setup();

    render(<ReferenceDocumentView projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: /write/ }));

    expect(screen.getByText("neverWritten")).toBeVisible();
    expect(write.mutate).toHaveBeenCalled();
  });

  it("says it is being written and offers nothing to read yet", () => {
    withDocument({ ...ready, status: "writing", parts: [] });

    render(<ReferenceDocumentView projectId="project-1" />);

    expect(screen.getByText("writing")).toBeVisible();
  });

  // A failed write leaves what was there readable, so it costs a retry.
  it("reports a failure and offers to start again", () => {
    withDocument({ ...ready, status: "failed" });

    render(<ReferenceDocumentView projectId="project-1" />);

    expect(screen.getByText("failed")).toBeVisible();
    expect(screen.getByRole("button", { name: /rewrite/ })).toBeVisible();
  });

  // FR-007: nothing usable is stated, not left as an empty page.
  it("says plainly when the documents hold nothing usable", () => {
    withDocument({ ...ready, outcome: "nothing_usable", parts: [] });

    render(<ReferenceDocumentView projectId="project-1" />);

    expect(screen.getByText("nothingUsable")).toBeVisible();
  });

  // FR-011: a gap is marked where it applies, never smoothed into a sentence
  // that reads as settled.
  it("sets a gap apart from a settled passage", () => {
    withDocument({
      ...ready,
      parts: [
        {
          title: "Planning",
          blocks: [
            {
              kind: "open_point",
              text: "La date de lancement n'est pas confirmée.",
              informationItemIds: [itemA],
            },
          ],
        },
      ],
    });

    render(<ReferenceDocumentView projectId="project-1" />);

    expect(screen.getByText("openPoint")).toBeVisible();
  });

  it("shows where a passage comes from on demand", async () => {
    withDocument(ready);
    const user = userEvent.setup();

    render(<ReferenceDocumentView projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: /showSource/ }));

    expect(screen.getByText("provenance")).toBeVisible();
  });

  // The document holds prose; correcting needs the statement's own wording, and
  // an empty field would be a correction dialog that cannot be submitted.
  it("opens a correction on the statement's own wording", async () => {
    withDocument(ready);
    const user = userEvent.setup();

    render(<ReferenceDocumentView projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: /correct/ }));

    expect(
      screen.getByText("correction:The product makes a project legible."),
    ).toBeVisible();
  });

  it("says the document failed to load rather than claiming none exists", () => {
    withDocument(undefined, { isError: true });

    render(<ReferenceDocumentView projectId="project-1" />);

    expect(screen.getByRole("alert")).toHaveTextContent("loadError");
    expect(screen.queryByText("neverWritten")).not.toBeInTheDocument();
  });

  it("announces the document when it arrives", () => {
    withDocument(ready);

    render(<ReferenceDocumentView projectId="project-1" />);

    expect(
      within(screen.getByRole("article")).getByRole("heading", {
        name: "Le projet",
      }),
    ).toBeVisible();
  });
});
