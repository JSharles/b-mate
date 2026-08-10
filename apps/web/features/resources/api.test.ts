import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/shared/lib/api-client";
import {
  acceptDraft,
  discardDraft,
  getCategoryContent,
  getReferenceDrafts,
  getResource,
  getResources,
  regenerateDraft,
  uploadResource,
} from "./api";

vi.mock("@/shared/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/lib/api-client")>();
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

const fakeResource = {
  id: "resource-1",
  projectId: "project-1",
  source: "upload" as const,
  status: "pending" as const,
  title: "Architecture overview",
};

describe("features/resources/api", () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  // A document is an input now, not something the client reads — nothing on it
  // is locale-dependent, so the locale query param went away with the content.
  it("getResources gets /projects/:id/resources with no locale", async () => {
    mockedApiFetch.mockResolvedValue([fakeResource]);

    const result = await getResources("project-1");

    expect(mockedApiFetch).toHaveBeenCalledWith("/projects/project-1/resources");
    expect(result).toEqual([fakeResource]);
  });

  it("getResource gets /projects/:id/resources/:resourceId", async () => {
    mockedApiFetch.mockResolvedValue(fakeResource);

    const result = await getResource("project-1", "resource-1");

    expect(mockedApiFetch).toHaveBeenCalledWith("/projects/project-1/resources/resource-1");
    expect(result).toEqual(fakeResource);
  });

  it("getReferenceDrafts gets the project's review queue", async () => {
    mockedApiFetch.mockResolvedValue([]);

    await getReferenceDrafts("project-1");

    expect(mockedApiFetch).toHaveBeenCalledWith("/projects/project-1/categories/drafts");
  });

  // The client layer is the one place the locale still matters: it is resolved
  // server-side, so it travels as a query param rather than an Accept-Language.
  it("getCategoryContent gets the client-facing content for a locale", async () => {
    mockedApiFetch.mockResolvedValue([]);

    await getCategoryContent("project-1", "en");

    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/projects/project-1/categories/content?locale=en",
    );
  });

  it("acceptDraft posts to the category's accept action", async () => {
    mockedApiFetch.mockResolvedValue(undefined);

    await acceptDraft("project-1", "overview");

    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/projects/project-1/categories/overview/draft/accept",
      { method: "POST" },
    );
  });

  it("discardDraft posts to the category's discard action", async () => {
    mockedApiFetch.mockResolvedValue(undefined);

    await discardDraft("project-1", "planning");

    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/projects/project-1/categories/planning/draft/discard",
      { method: "POST" },
    );
  });

  it("regenerateDraft sends the contributor's instruction in the body", async () => {
    mockedApiFetch.mockResolvedValue(undefined);

    await regenerateDraft("project-1", "planning", "The migration is March.");

    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/projects/project-1/categories/planning/draft/regenerate",
      { method: "POST", body: { instruction: "The migration is March." } },
    );
  });

  describe("uploadResource", () => {
    const file = new File(["data"], "a.pdf", { type: "application/pdf" });

    beforeEach(() => {
      global.fetch = vi.fn();
    });

    it("posts a multipart/form-data request with the file, and returns the parsed resource", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(fakeResource),
      });

      const result = await uploadResource("project-1", file);

      expect(global.fetch).toHaveBeenCalledWith(
        "http://localhost:3001/projects/project-1/resources",
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          body: expect.any(FormData) as FormData,
        }),
      );
      const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        { body: FormData },
      ];
      expect(options.body.get("file")).toBe(file);
      expect(result).toEqual(fakeResource);
    });

    it("throws an ApiError with the server's message on a non-OK response", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ message: "Unsupported file type." }),
      });

      await expect(uploadResource("project-1", file)).rejects.toThrow(
        "Unsupported file type.",
      );
    });
  });
});
