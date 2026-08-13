import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentAcknowledgement } from "schemas";
import {
  getDocument,
  listDocuments,
  uploadDocument,
  listSections,
  createSection,
  updateSection,
  archiveSection,
  composeSection,
  getSectionProposal,
  approveSectionProposal,
  getReferenceSummary,
  getReferenceDocument,
  writeReferenceDocument,
  addNote,
  removeNote,
} from "./api";
import {
  documentKey,
  documentsKey,
  useDocumentationDocuments,
  useSourceDocument,
  useUploadDocument,
  sectionsKey,
  sectionProposalKey,
  useSections,
  useSectionProposal,
  useCreateSection,
  useUpdateSection,
  useArchiveSection,
  useComposeSection,
  useApproveSectionProposal,
  referenceSummaryKey,
  referenceDocumentKey,
  useReferenceSummary,
  useReferenceDocument,
  useWriteReferenceDocument,
  notesKey,
  useAddNote,
  useRemoveNote,
} from "./hooks";

vi.mock("./api", () => ({
  listDocuments: vi.fn(),
  getDocument: vi.fn(),
  uploadDocument: vi.fn(),
  addNotionDocument: vi.fn(),
  proposeWorkingLanguage: vi.fn(),
  confirmWorkingLanguage: vi.fn(),
  listSections: vi.fn(),
  createSection: vi.fn(),
  updateSection: vi.fn(),
  archiveSection: vi.fn(),
  composeSection: vi.fn(),
  getSectionProposal: vi.fn(),
  approveSectionProposal: vi.fn(),
  getReferenceSummary: vi.fn(),
  getReferenceDocument: vi.fn(),
  writeReferenceDocument: vi.fn(),
  addNote: vi.fn(),
  listNotes: vi.fn(),
  removeNote: vi.fn(),
  getDocumentationWorkspace: vi.fn(),
  getClientContentPreview: vi.fn(),
  getPublicClientSections: vi.fn(),
  reorderSections: vi.fn(),
  previewDocumentRemoval: vi.fn(),
  confirmDocumentRemoval: vi.fn(),
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

  it("loads document pages and detail with separate keys", async () => {
    vi.mocked(listDocuments).mockResolvedValue({
      items: [],
      total: 0,
      nextCursor: null,
    });
    vi.mocked(getDocument).mockResolvedValue({} as never);
    const { Wrapper } = wrapper();

    renderHook(() => useDocumentationDocuments("project-1"), {
      wrapper: Wrapper,
    });
    renderHook(() => useSourceDocument("project-1", "document-1"), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(vi.mocked(listDocuments)).toHaveBeenCalled());
    // One infinite query owns every page now, so the cursor is no longer part
    // of the key — it is a page param inside it.
    expect(documentsKey("project-1")).not.toEqual(documentKey("project-1", "d"));
  });

  it("merges an acknowledgement into the first document page immediately", async () => {
    const acknowledgement = {
      document: { id: "document-1", title: "Brief", status: "received" },
      operation: { operationId: "operation-1", status: "queued" },
    } as unknown as DocumentAcknowledgement;
    vi.mocked(uploadDocument).mockResolvedValue(acknowledgement);
    const { Wrapper, queryClient } = wrapper();
    // Seeded in the shape the running app actually holds at this key — an
    // infinite query's `{ pages, pageParams }`. Seeding a flat page here let
    // this test pass while every real upload threw inside `onSuccess`, which
    // React Query reports as a failed mutation on a document that uploaded
    // fine.
    queryClient.setQueryData(documentsKey("project-1"), {
      pages: [{ items: [], total: 0, nextCursor: null }],
      pageParams: [undefined],
    });
    const { result } = renderHook(() => useUploadDocument("project-1"), {
      wrapper: Wrapper,
    });

    await act(async () => result.current.mutateAsync(new File(["x"], "brief.pdf")));

    expect(result.current.isError).toBe(false);
    expect(queryClient.getQueryData(documentsKey("project-1"))).toEqual({
      pages: [
        { items: [acknowledgement.document], total: 1, nextCursor: null },
      ],
      pageParams: [undefined],
    });
  });

  it("leaves later document pages untouched when acknowledging an upload", async () => {
    const acknowledgement = {
      document: { id: "document-9", title: "Brief", status: "received" },
      operation: { operationId: "operation-9", status: "queued" },
    } as unknown as DocumentAcknowledgement;
    vi.mocked(uploadDocument).mockResolvedValue(acknowledgement);
    const { Wrapper, queryClient } = wrapper();
    queryClient.setQueryData(documentsKey("project-1"), {
      pages: [
        { items: [{ id: "document-1" }], total: 2, nextCursor: "cursor-2" },
        { items: [{ id: "document-2" }], total: 2, nextCursor: null },
      ],
      pageParams: [undefined, "cursor-2"],
    });
    const { result } = renderHook(() => useUploadDocument("project-1"), {
      wrapper: Wrapper,
    });

    await act(async () => result.current.mutateAsync(new File(["x"], "brief.pdf")));

    const data = queryClient.getQueryData(documentsKey("project-1")) as {
      pages: { items: { id: string }[] }[];
    };
    expect(data.pages[0].items.map(({ id }) => id)).toEqual([
      "document-9",
      "document-1",
    ]);
    expect(data.pages[1].items.map(({ id }) => id)).toEqual(["document-2"]);
  });

  // FR-006: a note owes a rewrite, it never triggers one. Only the summary is
  // refreshed, so the badge counts what is owed while the developer goes on
  // answering.
  it("refreshes what is owed after a note, and rewrites nothing", async () => {
    vi.mocked(addNote).mockResolvedValue({} as never);
    const { Wrapper, queryClient } = wrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useAddNote("project-1"), {
      wrapper: Wrapper,
    });

    await act(async () =>
      result.current.mutateAsync({ content: "Le lancement est en octobre." }),
    );

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: notesKey("project-1"),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: referenceSummaryKey("project-1"),
    });
    expect(writeReferenceDocument).not.toHaveBeenCalled();
  });

  it("refreshes what is owed after a note is taken back", async () => {
    vi.mocked(removeNote).mockResolvedValue({} as never);
    const { Wrapper, queryClient } = wrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useRemoveNote("project-1"), {
      wrapper: Wrapper,
    });

    await act(async () => result.current.mutateAsync("note-1"));

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: notesKey("project-1"),
    });
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

  describe("sections", () => {
    it("keys the list and each section's proposal separately", async () => {
      vi.mocked(listSections).mockResolvedValue({ sections: [] });
      vi.mocked(getSectionProposal).mockResolvedValue(null);
      const { queryClient, Wrapper } = wrapper();

      renderHook(() => useSections("project-1"), { wrapper: Wrapper });
      renderHook(() => useSectionProposal("project-1", "section-1"), {
        wrapper: Wrapper,
      });

      await waitFor(() => {
        expect(queryClient.getQueryData(sectionsKey("project-1"))).toEqual({
          sections: [],
        });
      });
      expect(sectionProposalKey("project-1", "section-1")).not.toEqual(
        sectionsKey("project-1"),
      );
    });

    it("refreshes the list after creating, editing, archiving or composing", async () => {
      vi.mocked(createSection).mockResolvedValue({ id: "section-1" } as never);
      vi.mocked(updateSection).mockResolvedValue({} as never);
      vi.mocked(archiveSection).mockResolvedValue({ archived: true });
      vi.mocked(composeSection).mockResolvedValue({
        proposalId: "p",
        operationId: "o",
      });
      const { queryClient, Wrapper } = wrapper();
      const invalidate = vi.spyOn(queryClient, "invalidateQueries");

      const create = renderHook(() => useCreateSection("project-1"), {
        wrapper: Wrapper,
      });
      const update = renderHook(
        () => useUpdateSection("project-1", "section-1"),
        { wrapper: Wrapper },
      );
      const archive = renderHook(() => useArchiveSection("project-1"), {
        wrapper: Wrapper,
      });
      const compose = renderHook(() => useComposeSection("project-1"), {
        wrapper: Wrapper,
      });

      await act(async () => {
        await create.result.current.mutateAsync({
          name: "Le projet",
          instructions: "Ce que le client a demandé.",
          editorial: {
            length: "balanced",
            pedagogy: "guided",
            technicalFamiliarity: "novice",
            tone: "reassuring",
          },
        });
        await update.result.current.mutateAsync({
          name: "Planning",
          expectedVersion: 2,
        });
        await archive.result.current.mutateAsync("section-1");
        await compose.result.current.mutateAsync("section-1");
      });

      expect(invalidate).toHaveBeenCalledWith({
        queryKey: sectionsKey("project-1"),
      });
      expect(composeSection).toHaveBeenCalledWith("project-1", "section-1");
    });

    // Approving is what changes the client's view, so it has to invalidate the
    // published preview too — not only the section that produced it.
    it("refreshes the client preview when a proposal is approved", async () => {
      vi.mocked(approveSectionProposal).mockResolvedValue({
        proposalId: "p",
        releaseId: "r",
        approved: true,
      });
      const { queryClient, Wrapper } = wrapper();
      const invalidate = vi.spyOn(queryClient, "invalidateQueries");

      const approve = renderHook(
        () => useApproveSectionProposal("project-1", "section-1"),
        { wrapper: Wrapper },
      );
      await act(async () => {
        await approve.result.current.mutateAsync(3);
      });

      expect(approveSectionProposal).toHaveBeenCalledWith(
        "project-1",
        "section-1",
        3,
      );
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: sectionProposalKey("project-1", "section-1"),
      });
      expect(invalidate.mock.calls.length).toBeGreaterThan(2);
    });
  });

  describe("the reference document", () => {
    it("keys the summary and the document separately", async () => {
      vi.mocked(getReferenceSummary).mockResolvedValue({} as never);
      vi.mocked(getReferenceDocument).mockResolvedValue(null);
      const { queryClient, Wrapper } = wrapper();

      renderHook(() => useReferenceSummary("project-1"), { wrapper: Wrapper });
      renderHook(() => useReferenceDocument("project-1"), { wrapper: Wrapper });

      await waitFor(() => {
        expect(
          queryClient.getQueryData(referenceDocumentKey("project-1")),
        ).toBeNull();
      });
      expect(referenceSummaryKey("project-1")).not.toEqual(
        referenceDocumentKey("project-1"),
      );
    });

    // Writing changes both what the working page states and what the document
    // screen shows, so both have to be told to look again.
    it("refreshes the summary and the document after a write", async () => {
      vi.mocked(writeReferenceDocument).mockResolvedValue({
        documentId: "d",
        operationId: "o",
      });
      const { queryClient, Wrapper } = wrapper();
      const invalidate = vi.spyOn(queryClient, "invalidateQueries");

      const write = renderHook(() => useWriteReferenceDocument("project-1"), {
        wrapper: Wrapper,
      });
      await act(async () => {
        await write.result.current.mutateAsync();
      });

      expect(invalidate).toHaveBeenCalledWith({
        queryKey: referenceSummaryKey("project-1"),
      });
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: referenceDocumentKey("project-1"),
      });
    });
  });
});

