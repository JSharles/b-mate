import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useAddNote,
  useNotes,
  useReferenceDocument,
  useRemoveNote,
  useWriteReferenceDocument,
} from "../hooks";
import { ReferenceDocumentView } from "./reference-document-view";

vi.mock("../hooks", () => ({
  useReferenceDocument: vi.fn(),
  useWriteReferenceDocument: vi.fn(),
  useNotes: vi.fn(),
  useAddNote: vi.fn(),
  useRemoveNote: vi.fn(),
}));

const addNote = vi.fn();
const removeNote = vi.fn();
const write = vi.fn();

const paragraph = {
  kind: "paragraph" as const,
  text: "Le produit rend un projet lisible pour un client non technique.",
};
const gap = {
  kind: "gap" as const,
  text: "La date de lancement n'est pas fixée.",
  pointId: "p0",
};

function ready(overrides: Record<string, unknown> = {}) {
  return {
    id: "doc-1",
    status: "ready",
    outcome: "written",
    locale: "fr",
    parts: [
      {
        title: "Le projet",
        blocks: [paragraph, gap],
        documentTitles: ["Cahier des charges"],
      },
    ],
    points: [
      { id: "p0", question: "Quelle date de lancement ?", why: "Le client la lira." },
    ],
    unrelatedDocuments: [],
    failureCode: null,
    createdAt: new Date().toISOString(),
    version: 1,
    ...overrides,
  };
}

function withDocument(data: unknown, overrides: Record<string, unknown> = {}) {
  vi.mocked(useReferenceDocument).mockReturnValue({
    data,
    isPending: false,
    isError: false,
    ...overrides,
  } as never);
}

function withNotes(notes: unknown[]) {
  vi.mocked(useNotes).mockReturnValue({
    data: { notes },
    isPending: false,
    isError: false,
  } as never);
}

describe("ReferenceDocumentView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useWriteReferenceDocument).mockReturnValue({
      mutate: write,
      isPending: false,
    } as never);
    vi.mocked(useAddNote).mockReturnValue({
      mutate: addNote,
      isPending: false,
      isError: false,
    } as never);
    vi.mocked(useRemoveNote).mockReturnValue({
      mutate: removeNote,
      isPending: false,
    } as never);
    withNotes([]);
  });

  it("sets the document as continuous text under its headings", () => {
    withDocument(ready());

    render(<ReferenceDocumentView projectId="project-1" />);

    expect(screen.getByRole("heading", { name: "Le projet" })).toBeVisible();
    expect(screen.getByText(paragraph.text)).toBeVisible();
  });

  // FR-004: coarser than the per-sentence provenance it replaces, and honest
  // about it.
  it("says which documents a part drew on", () => {
    withDocument(ready());

    render(<ReferenceDocumentView projectId="project-1" />);

    expect(screen.getByText("drawnFrom")).toBeVisible();
  });

  // FR-016: what the documents never settled is marked where it applies, with
  // the question right there. No second list of the same questions elsewhere.
  it("asks its question where the gap is", () => {
    withDocument(ready());

    render(<ReferenceDocumentView projectId="project-1" />);

    expect(screen.getByText(gap.text)).toBeVisible();
    expect(screen.getByText("Quelle date de lancement ?")).toBeVisible();
    expect(screen.getByText("Le client la lira.")).toBeVisible();
  });

  // FR-012: an answer and a correction are the same thing — a note carrying
  // what was on screen when it was written.
  it("records an answer as a note carrying the question", async () => {
    withDocument(ready());
    const user = userEvent.setup();

    render(<ReferenceDocumentView projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "answer" }));
    await user.type(screen.getByLabelText("answer"), "Le 12 octobre.");
    await user.click(screen.getByRole("button", { name: "saveNote" }));

    expect(addNote).toHaveBeenCalledWith(
      { content: "Le 12 octobre.", context: "Quelle date de lancement ?" },
      expect.any(Object),
    );
  });

  it("records a correction as a note carrying the paragraph", async () => {
    withDocument(ready());
    const user = userEvent.setup();

    render(<ReferenceDocumentView projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "correct" }));
    await user.type(screen.getByLabelText("correct"), "C'est un portail.");
    await user.click(screen.getByRole("button", { name: "saveNote" }));

    expect(addNote).toHaveBeenCalledWith(
      { content: "C'est un portail.", context: paragraph.text },
      expect.any(Object),
    );
  });

  // FR-006: a note owes a rewrite, it never triggers one. The developer
  // answers several points, then rewrites once.
  it("does not rewrite the document when a note is written", async () => {
    withDocument(ready());
    const user = userEvent.setup();

    render(<ReferenceDocumentView projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "correct" }));
    await user.type(screen.getByLabelText("correct"), "C'est un portail.");
    await user.click(screen.getByRole("button", { name: "saveNote" }));

    expect(write).not.toHaveBeenCalled();
  });

  it("keeps an empty note from being saved", async () => {
    withDocument(ready());
    const user = userEvent.setup();

    render(<ReferenceDocumentView projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "correct" }));

    expect(screen.getByRole("button", { name: "saveNote" })).toBeDisabled();
  });

  // Every write starts from the original documents again, so what the developer
  // added has to stay visible — and removable.
  it("shows what the developer has added, and lets them take it back", async () => {
    withDocument(ready());
    withNotes([
      {
        id: "note-1",
        content: "Le lancement est en octobre.",
        context: "Quelle date de lancement ?",
        authorName: "Jean-Charles Barq",
        createdAt: new Date().toISOString(),
      },
    ]);
    const user = userEvent.setup();

    render(<ReferenceDocumentView projectId="project-1" />);
    const notes = screen.getByRole("region", { name: "notesTitle" });
    expect(within(notes).getByText("Le lancement est en octobre.")).toBeVisible();
    await user.click(within(notes).getByRole("button", { name: "removeNote" }));

    expect(removeNote).toHaveBeenCalledWith("note-1");
  });

  it("shows nothing about notes on a project that has none", () => {
    withDocument(ready());

    render(<ReferenceDocumentView projectId="project-1" />);

    expect(screen.queryByText("notesTitle")).not.toBeInTheDocument();
  });

  // FR-017: an upload mistake is named. Ignoring it silently would leave the
  // developer waiting for a document that was never going to appear.
  it("names a document that has nothing to do with the project", () => {
    withDocument(ready({ unrelatedDocuments: ["Facture EDF.pdf"] }));

    render(<ReferenceDocumentView projectId="project-1" />);

    expect(screen.getByRole("alert")).toHaveTextContent("unrelated");
    expect(screen.getByText("Facture EDF.pdf")).toBeVisible();
  });

  it("offers a first write on a project that has never had one", async () => {
    withDocument(null);
    const user = userEvent.setup();

    render(<ReferenceDocumentView projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: /write/ }));

    expect(write).toHaveBeenCalled();
  });

  it("says it is being written rather than showing an empty document", () => {
    withDocument(ready({ status: "writing", parts: [], points: [] }));

    render(<ReferenceDocumentView projectId="project-1" />);

    expect(screen.getByText("writing")).toBeVisible();
  });

  // What was there is still readable; a failure costs a retry, not the
  // reference itself.
  it("offers a retry when the write failed", () => {
    withDocument(ready({ status: "failed", outcome: null, parts: [] }));

    render(<ReferenceDocumentView projectId="project-1" />);

    expect(screen.getByText("failed")).toBeVisible();
    expect(screen.getByRole("button", { name: /rewrite/ })).toBeVisible();
  });

  it("says the documents held nothing usable rather than showing a blank page", () => {
    withDocument(ready({ outcome: "nothing_usable", parts: [], points: [] }));

    render(<ReferenceDocumentView projectId="project-1" />);

    expect(screen.getByText("nothingUsable")).toBeVisible();
  });

  // A failed request is not a project without a document.
  it("says it failed to load rather than offering a first write", () => {
    withDocument(undefined, { isError: true });

    render(<ReferenceDocumentView projectId="project-1" />);

    expect(screen.getByRole("alert")).toHaveTextContent("loadError");
    expect(screen.queryByText("neverWritten")).not.toBeInTheDocument();
  });
});
