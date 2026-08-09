import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  approveResourceSection,
  getResource,
  getResources,
  rejectResourceSection,
  uploadResource,
} from "./api";
import {
  resourceKey,
  resourcesKey,
  useApproveResourceSection,
  useRejectResourceSection,
  useResource,
  useResources,
  useUploadResource,
} from "./hooks";

vi.mock("./api", () => ({
  getResources: vi.fn(),
  getResource: vi.fn(),
  uploadResource: vi.fn(),
  approveResourceSection: vi.fn(),
  rejectResourceSection: vi.fn(),
}));

const mockedGetResources = vi.mocked(getResources);
const mockedGetResource = vi.mocked(getResource);
const mockedUploadResource = vi.mocked(uploadResource);
const mockedApproveResourceSection = vi.mocked(approveResourceSection);
const mockedRejectResourceSection = vi.mocked(rejectResourceSection);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    queryClient,
    Wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

const fakeResource = {
  id: "resource-1",
  projectId: "project-1",
  source: "upload" as const,
  status: "processing" as const,
  title: "Architecture overview",
  originalFileUrl: null,
  originalFileName: "a.pdf",
  originalFileMimeType: "application/pdf",
  notionPageUrl: null,
  failureReason: null,
  publishedAt: null,
  createdAt: "2026-08-08T00:00:00.000Z",
  sections: [],
};

describe("useResources", () => {
  it("fetches resources for the given project and current locale", async () => {
    mockedGetResources.mockResolvedValue([fakeResource]);
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useResources("project-1"), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.data).toEqual([fakeResource]));
    expect(mockedGetResources).toHaveBeenCalledWith("project-1", "fr");
  });
});

describe("useResource", () => {
  it("fetches a single resource for the given project/resource/locale", async () => {
    mockedGetResource.mockResolvedValue(fakeResource);
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useResource("project-1", "resource-1"), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.data).toEqual(fakeResource));
    expect(mockedGetResource).toHaveBeenCalledWith("project-1", "resource-1", "fr");
  });
});

describe("useUploadResource", () => {
  it("uploads the file and invalidates the resources list on success", async () => {
    mockedUploadResource.mockResolvedValue(fakeResource);
    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const file = new File(["data"], "a.pdf", { type: "application/pdf" });

    const { result } = renderHook(() => useUploadResource("project-1"), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(file);
    });

    expect(mockedUploadResource).toHaveBeenCalledWith("project-1", file);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: resourcesKey("project-1", "fr"),
    });
  });
});

describe("useApproveResourceSection", () => {
  it("approves the assignment and invalidates both the list and the resource's own query", async () => {
    mockedApproveResourceSection.mockResolvedValue(undefined);
    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useApproveResourceSection("project-1"), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        resourceId: "resource-1",
        sectionId: "section-1",
      });
    });

    expect(mockedApproveResourceSection).toHaveBeenCalledWith(
      "project-1",
      "resource-1",
      "section-1",
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: resourcesKey("project-1", "fr"),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: resourceKey("project-1", "resource-1", "fr"),
    });
  });
});

describe("useRejectResourceSection", () => {
  it("rejects the assignment and invalidates both the list and the resource's own query", async () => {
    mockedRejectResourceSection.mockResolvedValue(undefined);
    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useRejectResourceSection("project-1"), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        resourceId: "resource-1",
        sectionId: "section-1",
      });
    });

    expect(mockedRejectResourceSection).toHaveBeenCalledWith(
      "project-1",
      "resource-1",
      "section-1",
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: resourcesKey("project-1", "fr"),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: resourceKey("project-1", "resource-1", "fr"),
    });
  });
});

describe("query keys", () => {
  it("include the locale so switching languages refetches", () => {
    expect(resourcesKey("project-1", "en")).not.toEqual(resourcesKey("project-1", "fr"));
    expect(resourceKey("project-1", "resource-1", "en")).not.toEqual(
      resourceKey("project-1", "resource-1", "fr"),
    );
  });
});
