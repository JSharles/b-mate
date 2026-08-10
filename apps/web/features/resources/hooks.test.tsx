import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { ReferenceDraft, Resource } from "schemas";
import { describe, expect, it, vi } from "vitest";
import {
  acceptDraft,
  deleteResource,
  discardDraft,
  getCategoryContent,
  getReferenceDrafts,
  getResource,
  getResources,
  regenerateDraft,
  uploadResource,
} from "./api";
import {
  categoryContentKey,
  referenceDraftsKey,
  resourceKey,
  resourcesKey,
  useAcceptDraft,
  useCategoryContent,
  useDeleteResource,
  useDiscardDraft,
  useReferenceDrafts,
  useRegenerateDraft,
  useResource,
  useResources,
  useUploadResource,
} from "./hooks";

vi.mock("./api", () => ({
  getResources: vi.fn(),
  getResource: vi.fn(),
  deleteResource: vi.fn(),
  uploadResource: vi.fn(),
  getReferenceDrafts: vi.fn(),
  getCategoryContent: vi.fn(),
  acceptDraft: vi.fn(),
  discardDraft: vi.fn(),
  regenerateDraft: vi.fn(),
}));

const mockedGetResources = vi.mocked(getResources);
const mockedGetResource = vi.mocked(getResource);
const mockedDeleteResource = vi.mocked(deleteResource);
const mockedUploadResource = vi.mocked(uploadResource);
const mockedGetReferenceDrafts = vi.mocked(getReferenceDrafts);
const mockedGetCategoryContent = vi.mocked(getCategoryContent);
const mockedAcceptDraft = vi.mocked(acceptDraft);
const mockedDiscardDraft = vi.mocked(discardDraft);
const mockedRegenerateDraft = vi.mocked(regenerateDraft);

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

const fakeResource: Resource = {
  id: "resource-1",
  projectId: "project-1",
  source: "upload",
  status: "pending",
  title: "Architecture overview",
  originalFileUrl: null,
  originalFileName: "a.pdf",
  originalFileMimeType: "application/pdf",
  notionPageUrl: null,
  failureReason: null,
  createdAt: "2026-08-08T00:00:00.000Z",
};

const fakeDraft: ReferenceDraft = {
  categoryKey: "overview",
  status: "pending_review",
  content: "The reference version awaiting review.",
  trigger: "document_added",
  triggerDocumentTitle: "Architecture overview",
  attempt: 1,
  questions: [],
  createdAt: "2026-08-08T00:00:00.000Z",
};

describe("useResources", () => {
  // A document carries no content any more, so nothing about the list is
  // locale-dependent — the locale left both the call and the query key.
  it("fetches the project's documents without a locale", async () => {
    mockedGetResources.mockResolvedValue([fakeResource]);
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useResources("project-1"), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.data).toEqual([fakeResource]));
    expect(mockedGetResources).toHaveBeenCalledWith("project-1");
  });
});

describe("useResource", () => {
  it("fetches a single document", async () => {
    mockedGetResource.mockResolvedValue(fakeResource);
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useResource("project-1", "resource-1"), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.data).toEqual(fakeResource));
    expect(mockedGetResource).toHaveBeenCalledWith("project-1", "resource-1");
  });
});

describe("useReferenceDrafts", () => {
  it("fetches the pending review queue for the project", async () => {
    mockedGetReferenceDrafts.mockResolvedValue([fakeDraft]);
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useReferenceDrafts("project-1"), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.data).toEqual([fakeDraft]));
    expect(mockedGetReferenceDrafts).toHaveBeenCalledWith("project-1");
  });
});

describe("useCategoryContent", () => {
  // The client layer *is* locale-dependent — it is resolved server-side, so
  // the locale has to reach both the request and the cache key.
  it("fetches the client-facing content for the current locale", async () => {
    mockedGetCategoryContent.mockResolvedValue([
      { categoryKey: "overview", content: "What this project is for." },
    ]);
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useCategoryContent("project-1"), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(mockedGetCategoryContent).toHaveBeenCalledWith("project-1", "fr");
  });
});

describe("useUploadResource", () => {
  it("uploads the file and invalidates the document list on success", async () => {
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
      queryKey: resourcesKey("project-1"),
    });
  });
});

describe("useAcceptDraft", () => {
  // Accepting promotes the draft AND changes what a client reads, so both the
  // queue and the client content have to be refetched.
  it("accepts the draft and invalidates the queue and the client content", async () => {
    mockedAcceptDraft.mockResolvedValue(undefined);
    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useAcceptDraft("project-1"), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ categoryKey: "overview" });
    });

    expect(mockedAcceptDraft).toHaveBeenCalledWith("project-1", "overview");
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: referenceDraftsKey("project-1"),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: categoryContentKey("project-1", "fr"),
    });
  });
});

describe("useDiscardDraft", () => {
  it("discards the draft and invalidates the queue", async () => {
    mockedDiscardDraft.mockResolvedValue(undefined);
    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDiscardDraft("project-1"), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ categoryKey: "planning" });
    });

    expect(mockedDiscardDraft).toHaveBeenCalledWith("project-1", "planning");
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: referenceDraftsKey("project-1"),
    });
  });
});

describe("useRegenerateDraft", () => {
  it("passes the contributor's instruction through and invalidates the queue", async () => {
    mockedRegenerateDraft.mockResolvedValue(undefined);
    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useRegenerateDraft("project-1"), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        categoryKey: "planning",
        instruction: "The migration is March, not February.",
      });
    });

    expect(mockedRegenerateDraft).toHaveBeenCalledWith(
      "project-1",
      "planning",
      "The migration is March, not February.",
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: referenceDraftsKey("project-1"),
    });
  });
});

describe("useDeleteResource", () => {
  // Deleting an absorbed document rebuilds the categories it fed, and those
  // rebuilds land in the review queue — so the queue is stale too, not just
  // the document list.
  it("invalidates the review queue as well as the document list", async () => {
    mockedDeleteResource.mockResolvedValue(undefined);
    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteResource("project-1"), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync("resource-1");
    });

    expect(mockedDeleteResource).toHaveBeenCalledWith("project-1", "resource-1");
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: resourcesKey("project-1"),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: referenceDraftsKey("project-1"),
    });
  });
});

describe("query keys", () => {
  it("keeps the locale on the client content key so switching languages refetches", () => {
    expect(categoryContentKey("project-1", "en")).not.toEqual(
      categoryContentKey("project-1", "fr"),
    );
  });

  it("keeps a document's own query separate from the list", () => {
    expect(resourceKey("project-1", "resource-1")).not.toEqual(resourcesKey("project-1"));
  });
});
