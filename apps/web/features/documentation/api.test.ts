import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/shared/lib/api-client";
import {
  addNotionDocument,
  addNote,
  confirmDocumentRemoval,
  getDocument,
  getDocumentationWorkspace,
  getPublicClientSections,
  listSections,
  createSection,
  updateSection,
  reorderSections,
  composeSection,
  getSectionProposal,
  approveSectionProposal,
  replaceMilestones,
  setCurrentMilestone,
  archiveSection,
  getReferenceSummary,
  getReferenceDocument,
  writeReferenceDocument,
  listNotes,
  removeNote,
  listDocuments,
  previewDocumentRemoval,
  uploadDocument,
} from "./api";

vi.mock("@/shared/lib/api-client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/shared/lib/api-client")>();
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

describe("documentation api", () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it("uses cursor-safe document and detail routes", async () => {
    mockedApiFetch.mockResolvedValue({});

    await listDocuments("project-1", "cursor 1");
    await getDocument("project-1", "document-1");

    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/projects/project-1/documentation/documents?cursor=cursor+1",
    );
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/projects/project-1/documentation/documents/document-1",
    );
  });

  it("posts a Notion page", async () => {
    mockedApiFetch.mockResolvedValue({});

    await addNotionDocument("project-1", {
      pageUrl: "https://notion.so/page",
    });

    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/projects/project-1/documentation/documents/notion",
      { method: "POST", body: { pageUrl: "https://notion.so/page" } },
    );
  });

  // FR-012: an answer and a correction are the same call, carrying what was on
  // screen as the note's context.
  it("records a note, lists them and takes one back", async () => {
    mockedApiFetch.mockResolvedValue({});

    await addNote("project-1", {
      content: "Le lancement est en octobre.",
      context: "Quelle date de lancement ?",
    });
    await listNotes("project-1");
    await removeNote("project-1", "note-1");

    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/projects/project-1/documentation/reference/notes",
      {
        method: "POST",
        body: {
          content: "Le lancement est en octobre.",
          context: "Quelle date de lancement ?",
        },
      },
    );
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/projects/project-1/documentation/reference/notes",
    );
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/projects/project-1/documentation/reference/notes/note-1",
      { method: "DELETE" },
    );
  });

  it("uploads multipart content to the document endpoint", async () => {
    const file = new File(["data"], "brief.pdf", { type: "application/pdf" });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(JSON.stringify({ document: {}, operation: {} })),
    });

    await uploadDocument("project-1", file);

    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:3001/projects/project-1/documentation/documents",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: expect.any(FormData) as FormData,
      }),
    );
  });

  it("owns the complete contributor review, publication preview, editorial, and removal API surface", async () => {
    mockedApiFetch.mockResolvedValue({});
    await getDocumentationWorkspace("project-1");
    await getPublicClientSections("project-1");
    await listSections("project-1");
    await createSection("project-1", {
      name: "Le projet",
      kind: "prose" as const,
      instructions: "Ce que le client a demandé.",
      editorial: {
        length: "balanced",
        pedagogy: "guided",
        technicalFamiliarity: "novice",
        tone: "reassuring",
      },
    });
    await updateSection("project-1", "section-1", {
      name: "Planning",
      expectedVersion: 2,
    });
    await reorderSections("project-1", ["section-1"]);
    await composeSection("project-1", "section-1");
    await getSectionProposal("project-1", "section-1");
    await approveSectionProposal("project-1", "section-1", 3);
    await replaceMilestones("project-1", "section-1", {
      milestones: [
        { id: null, when: "Q3 2026", title: "Recette", description: null },
      ],
      expectedProposalVersion: 2,
    });
    await setCurrentMilestone("project-1", "section-1", {
      milestoneId: null,
      expectedVersion: 4,
    });
    await archiveSection("project-1", "section-1");
    await getReferenceSummary("project-1");
    await getReferenceDocument("project-1");
    await writeReferenceDocument("project-1");
    await previewDocumentRemoval("project-1", "document-1");
    await confirmDocumentRemoval("project-1", "document-1", {
      expectedDocumentVersion: 2,
      confirmed: true,
    });

    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/projects/project-1/documentation/documents/document-1/removal",
      { method: "POST", body: { expectedDocumentVersion: 2, confirmed: true } },
    );
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/projects/project-1/documentation/sections/section-1/proposal/approve",
      // apiFetch serialises the body itself. Asserting the object, not a
      // string, is what makes a second JSON.stringify fail here rather than
      // at runtime with a 400 the dialog mislabels.
      { method: "POST", body: { expectedVersion: 3 } },
    );
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/projects/project-1/documentation/sections/section-1",
      { method: "DELETE" },
    );
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/projects/project-1/documentation/reference",
      { method: "POST" },
    );
  });

  it("surfaces structured and proxy upload failures", async () => {
    const file = new File(["data"], "brief.pdf", { type: "application/pdf" });
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 422,
        statusText: "Unprocessable Entity",
        text: () =>
          Promise.resolve(
            JSON.stringify({
              message: ["File is too large", "Unsupported type"],
            }),
          ),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        text: () => Promise.resolve("upstream unavailable"),
      });

    await expect(uploadDocument("project-1", file)).rejects.toMatchObject({
      message: "File is too large, Unsupported type",
      status: 422,
    });
    await expect(uploadDocument("project-1", file)).rejects.toMatchObject({
      message: "Service Unavailable",
      status: 503,
    });
  });

  // A project that has never had a reference document answers with an empty
  // body. apiFetch reads that as `undefined`, which TanStack Query rejects as a
  // result — so "none yet" would reach the screen as a failed request.
  it("turns an absent reference document into null, not undefined", async () => {
    mockedApiFetch.mockResolvedValue(undefined);

    await expect(getReferenceDocument("project-1")).resolves.toBeNull();
  });
});
