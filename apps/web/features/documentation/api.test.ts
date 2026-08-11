import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/shared/lib/api-client";
import {
  addNotionDocument,
  cancelEditorialProfile,
  confirmDocumentRemoval,
  confirmEditorialProfile,
  correctCategoryDraft,
  correctSourceItem,
  getCategoryDraft,
  getCanonicalSource,
  getClientContentPreview,
  getDocument,
  getDocumentationWorkspace,
  getEditorialProfile,
  getItemProvenance,
  listCategoryDrafts,
  listClarifications,
  listDocuments,
  listSourceRevisions,
  previewDocumentRemoval,
  proposeEditorialProfile,
  resolveClarifications,
  retryDocumentRemoval,
  retryDocumentProcessing,
  reviewCategoryDraft,
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
    await listClarifications("project-1", {
      status: "open",
      categoryKey: "overview",
      cursor: "next",
    });
    await resolveClarifications("project-1", {
      expectedSourceRevisionId: "00000000-0000-4000-8000-000000000001",
      resolutions: [],
    });
    await getDocumentationWorkspace("project-1");
    await listCategoryDrafts("project-1");
    await getCategoryDraft("project-1", "draft-1");
    await reviewCategoryDraft("project-1", "draft-1", "accept", 2);
    await correctCategoryDraft(
      "project-1",
      "draft-1",
      2,
      "Correct the launch date",
    );
    await getClientContentPreview("project-1");
    await getEditorialProfile("project-1");
    await proposeEditorialProfile("project-1", 2, {
      length: "concise",
      pedagogy: "guided",
      technicalFamiliarity: "novice",
      tone: "reassuring",
      guidance: null,
    });
    await confirmEditorialProfile("project-1", "proposal-1", 3);
    await cancelEditorialProfile("project-1", "proposal-1", 3);
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
});
