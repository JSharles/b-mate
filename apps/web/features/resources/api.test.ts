import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/shared/lib/api-client";
import { getResource, getResources, uploadResource } from "./api";

vi.mock("@/shared/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/lib/api-client")>();
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

const fakeResource = {
  id: "resource-1",
  projectId: "project-1",
  source: "upload" as const,
  status: "processing" as const,
  title: "Architecture overview",
};

describe("features/resources/api", () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it("getResources gets /projects/:id/resources with the locale query param", async () => {
    mockedApiFetch.mockResolvedValue([fakeResource]);

    const result = await getResources("project-1", "fr");

    expect(mockedApiFetch).toHaveBeenCalledWith("/projects/project-1/resources?locale=fr");
    expect(result).toEqual([fakeResource]);
  });

  it("getResource gets /projects/:id/resources/:resourceId with the locale query param", async () => {
    mockedApiFetch.mockResolvedValue(fakeResource);

    const result = await getResource("project-1", "resource-1", "en");

    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/projects/project-1/resources/resource-1?locale=en",
    );
    expect(result).toEqual(fakeResource);
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
