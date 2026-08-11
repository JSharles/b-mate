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

    renderHook(() => useDocumentationDocuments("project-1", "cursor-1"), {
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
    expect(documentsKey("project-1", "cursor-1")).not.toEqual(
      documentsKey("project-1"),
    );
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
    await waitFor(() => expect(listClarifications).toHaveBeenCalledWith("project-1", { status: "open" }));
    expect(clarificationsKey("project-1", { cursor: "next" })).not.toEqual(
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
});
