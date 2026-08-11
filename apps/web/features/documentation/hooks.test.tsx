import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentAcknowledgement } from "schemas";
import {
  correctSourceItem,
  getCanonicalSource,
  getDocument,
  getItemProvenance,
  listDocuments,
  uploadDocument,
  listClarifications,
  resolveClarifications,
} from "./api";
import {
  canonicalSourceKey,
  documentKey,
  documentsKey,
  provenanceKey,
  useCanonicalSource,
  useDocumentationDocuments,
  useSourceDocument,
  useSourceItemCorrection,
  useSourceItemProvenance,
  useUploadDocument,
  clarificationsKey,
  useClarifications,
  useResolveClarifications,
} from "./hooks";

vi.mock("./api", () => ({
  listDocuments: vi.fn(),
  getDocument: vi.fn(),
  uploadDocument: vi.fn(),
  addNotionDocument: vi.fn(),
  getCanonicalSource: vi.fn(),
  getItemProvenance: vi.fn(),
  correctSourceItem: vi.fn(),
  proposeWorkingLanguage: vi.fn(),
  confirmWorkingLanguage: vi.fn(),
  listClarifications: vi.fn(),
  resolveClarifications: vi.fn(),
}));

function wrapper() {
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

describe("documentation hooks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads document pages, detail, source and provenance with separate keys", async () => {
    vi.mocked(listDocuments).mockResolvedValue({ items: [], total: 0, nextCursor: null });
    vi.mocked(getDocument).mockResolvedValue({} as never);
    vi.mocked(getCanonicalSource).mockResolvedValue({} as never);
    vi.mocked(getItemProvenance).mockResolvedValue({} as never);
    const { Wrapper } = wrapper();

    renderHook(() => useDocumentationDocuments("project-1"), {
      wrapper: Wrapper,
    });
    renderHook(() => useSourceDocument("project-1", "document-1"), {
      wrapper: Wrapper,
    });
    renderHook(() => useCanonicalSource("project-1", {}), { wrapper: Wrapper });
    renderHook(() => useSourceItemProvenance("project-1", "item-1"), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(vi.mocked(listDocuments)).toHaveBeenCalled());
    // One infinite query owns every page now, so the cursor is no longer part
    // of the key — it is a page param inside it.
    expect(documentsKey("project-1")).not.toEqual(documentKey("project-1", "d"));
    expect(documentKey("project-1", "document-1")).not.toEqual(
      canonicalSourceKey("project-1", {}),
    );
  });

  it("merges an acknowledgement into the first document page immediately", async () => {
    const acknowledgement = {
      document: { id: "document-1", title: "Brief", status: "received" },
      operation: { operationId: "operation-1", status: "queued" },
    } as unknown as DocumentAcknowledgement;
    vi.mocked(uploadDocument).mockResolvedValue(acknowledgement);
    const { Wrapper, queryClient } = wrapper();
    queryClient.setQueryData(documentsKey("project-1"), {
      items: [],
      total: 0,
      nextCursor: null,
    });
    const { result } = renderHook(() => useUploadDocument("project-1"), {
      wrapper: Wrapper,
    });

    await act(async () => result.current.mutateAsync(new File(["x"], "brief.pdf")));

    expect(queryClient.getQueryData(documentsKey("project-1"))).toEqual({
      items: [acknowledgement.document],
      total: 1,
      nextCursor: null,
    });
  });

  it("invalidates canonical source and provenance after correction", async () => {
    vi.mocked(correctSourceItem).mockResolvedValue({} as never);
    const { Wrapper, queryClient } = wrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(
      () => useSourceItemCorrection("project-1", "item-1"),
      { wrapper: Wrapper },
    );

    await act(async () =>
      result.current.mutateAsync({
        expectedSourceRevisionId: "revision-1",
        correctedContent: "Correction",
      }),
    );

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: canonicalSourceKey("project-1", {}),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: provenanceKey("project-1", "item-1"),
    });
  });

  it("loads all clarification pages and invalidates source plus the clarification family after resolution", async () => {
    vi.mocked(listClarifications).mockResolvedValue({ items: [], total: 7, nextCursor: null });
    vi.mocked(resolveClarifications).mockResolvedValue({ items: [], sourceRevisionId: null });
    const { Wrapper, queryClient } = wrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    renderHook(() => useClarifications("project-1", { status: "open" }), { wrapper: Wrapper });
    await waitFor(() =>
      expect(listClarifications).toHaveBeenCalledWith("project-1", {
        status: "open",
        cursor: undefined,
      }),
    );
    // The cursor is a page param inside one infinite query, not part of its
    // key — filters still are, so a filtered list stays its own cache entry.
    expect(clarificationsKey("project-1", { status: "open" })).not.toEqual(
      clarificationsKey("project-1"),
    );
    const { result } = renderHook(() => useResolveClarifications("project-1"), { wrapper: Wrapper });
    await act(async () => result.current.mutateAsync({
      expectedSourceRevisionId: "00000000-0000-4000-8000-000000000001",
      resolutions: [{
        clarificationId: "00000000-0000-4000-8000-000000000002",
        expectedVersion: 1,
        action: "leave_open",
      }],
    }));
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["projects", "project-1", "documentation", "clarifications"],
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: canonicalSourceKey("project-1", {}) });
  });

  // Every one of these endpoints returns a `nextCursor` that used to be
  // discarded, so a project past its first page had documents it simply could
  // not reach — while the header went on counting them.
  it("reads a second page of documents and appends it to the first", async () => {
    vi.mocked(listDocuments)
      .mockResolvedValueOnce({
        items: [{ id: "doc-1", title: "Cadrage" }],
        total: 2,
        nextCursor: "cursor-2",
      } as never)
      .mockResolvedValueOnce({
        items: [{ id: "doc-2", title: "Architecture" }],
        total: 2,
        nextCursor: null,
      } as never);
    const { Wrapper } = wrapper();

    const { result } = renderHook(() => useDocumentationDocuments("project-1"), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.data?.items).toHaveLength(1));
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.data?.items).toHaveLength(2));
    expect(listDocuments).toHaveBeenLastCalledWith("project-1", "cursor-2");
    // The count in the header comes from the page, and must keep describing
    // the whole corpus rather than what happens to be loaded.
    expect(result.current.data?.total).toBe(2);
    expect(result.current.hasNextPage).toBe(false);
  });

  it("reads a second page of the canonical source, keeping the revision header", async () => {
    vi.mocked(getCanonicalSource)
      .mockResolvedValueOnce({
        revision: { id: "revision-1", sequence: 4 },
        workingLanguage: "fr",
        items: [{ id: "item-1" }],
        nextCursor: "cursor-2",
      } as never)
      .mockResolvedValueOnce({
        revision: { id: "revision-1", sequence: 4 },
        workingLanguage: "fr",
        items: [{ id: "item-2" }],
        nextCursor: null,
      } as never);
    const { Wrapper } = wrapper();

    const { result } = renderHook(() => useCanonicalSource("project-1", {}), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.data?.items).toHaveLength(2));
    expect(result.current.data?.revision?.sequence).toBe(4);
    expect(getCanonicalSource).toHaveBeenLastCalledWith("project-1", {
      cursor: "cursor-2",
    });
  });

  it("reads a second page of clarifications", async () => {
    vi.mocked(listClarifications)
      .mockResolvedValueOnce({
        items: [{ id: "clarification-1" }],
        total: 2,
        nextCursor: "cursor-2",
      } as never)
      .mockResolvedValueOnce({
        items: [{ id: "clarification-2" }],
        total: 2,
        nextCursor: null,
      } as never);
    const { Wrapper } = wrapper();

    const { result } = renderHook(
      () => useClarifications("project-1", { status: "open" }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.data?.items).toHaveLength(2));
    expect(listClarifications).toHaveBeenLastCalledWith("project-1", {
      status: "open",
      cursor: "cursor-2",
    });
  });
});
