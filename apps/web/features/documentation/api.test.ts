import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/shared/lib/api-client";
import {
  addNotionDocument,
  confirmDocumentRemoval,
  correctSourceItem,
  getCanonicalSource,
  getClientContentPreview,
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
  archiveSection,
  getReferenceSummary,
  getReferenceDocument,
  writeReferenceDocument,
  getItemProvenance,
  listClarifications,
  listDocuments,
  listSourceRevisions,
  previewDocumentRemoval,
  resolveClarifications,
  retryDocumentRemoval,
  retryDocumentProcessing,
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

  it("uses cursor-safe document, detail, source and provenance routes", async () => {
    mockedApiFetch.mockResolvedValue({});

    await listDocuments("project-1", "cursor 1");
    await getDocument("project-1", "document-1");
    await getCanonicalSource("project-1", {
      revisionId: "revision-1",
      cursor: "cursor 2",
    });
    await getItemProvenance("project-1", "item-1", "revision-1");

    expect(mockedApiFetch).toHaveBeenNthCalledWith(
      1,
      "/projects/project-1/documentation/documents?cursor=cursor+1",
    );
    expect(mockedApiFetch).toHaveBeenNthCalledWith(
      2,
      "/projects/project-1/documentation/documents/document-1",
    );
    expect(mockedApiFetch).toHaveBeenNthCalledWith(
      3,
      "/projects/project-1/documentation/source?revisionId=revision-1&cursor=cursor+2",
    );
    expect(mockedApiFetch).toHaveBeenNthCalledWith(
      4,
      "/projects/project-1/documentation/source/items/item-1/provenance?revisionId=revision-1",
    );
  });

  it("posts a Notion page and a guided correction", async () => {
    mockedApiFetch.mockResolvedValue({});
    await addNotionDocument("project-1", { pageUrl: "https://notion.so/page" });
    await correctSourceItem("project-1", "item-1", {
      expectedSourceRevisionId: "revision-1",
      correctedContent: "Correction",
    });

    expect(mockedApiFetch).toHaveBeenLastCalledWith(
      "/projects/project-1/documentation/source/items/item-1/corrections",
      {
        method: "POST",
        body: {
          expectedSourceRevisionId: "revision-1",
          correctedContent: "Correction",
        },
      },
    );
  });

  it("uploads multipart content to the canonical document endpoint", async () => {
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
    await listSourceRevisions("project-1", "next");
    await listClarifications("project-1", { status: "open", cursor: "next" });
    await resolveClarifications("project-1", {
      expectedSourceRevisionId: "00000000-0000-4000-8000-000000000001",
      resolutions: [],
    });
    await getDocumentationWorkspace("project-1");
    await getClientContentPreview("project-1");
    await getPublicClientSections("project-1");
    await listSections("project-1");
    await createSection("project-1", {
      name: "Le projet",
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
    await archiveSection("project-1", "section-1");
    await getReferenceSummary("project-1");
    await getReferenceDocument("project-1");
    await writeReferenceDocument("project-1");
    await previewDocumentRemoval("project-1", "document-1");
    await confirmDocumentRemoval("project-1", "document-1", {
      expectedDocumentVersion: 2,
      expectedSourceRevisionId: "00000000-0000-4000-8000-000000000001",
      confirmationToken: "a".repeat(64),
      confirmed: true,
    });
    await retryDocumentRemoval("project-1", "document-1");
    await retryDocumentProcessing("project-1", "document-1");

    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/projects/project-1/documentation/documents/document-1/retry-processing",
      { method: "POST" },
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
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/projects/project-1/documentation/documents/document-1/removal/retry",
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
