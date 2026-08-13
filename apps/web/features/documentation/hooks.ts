"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";
import type {
  CreateSectionRequest,
  ReplaceMilestonesRequest,
  SetCurrentMilestoneRequest,
  SourceDocument,
  UpdateSectionRequest,
} from "schemas";
import {
  addNotionDocument,
  CursorPage,
  getDocument,
  listDocuments,
  uploadDocument,
  getPublicClientSections,
  approveSectionProposal,
  archiveSection,
  composeSection,
  createSection,
  getSectionProposal,
  listSections,
  replaceMilestones,
  setCurrentMilestone,
  updateSection,
  getReferenceSummary,
  getReferenceDocument,
  writeReferenceDocument,
  addNote,
  listNotes,
  removeNote,
  getDocumentationWorkspace,
  confirmDocumentRemoval,
  previewDocumentRemoval,
} from "./api";
import type { AddNoteRequest } from "schemas";
import { useTranslations } from "next-intl";

// A tab nobody is looking at is not worth a request every three seconds. Guarded
// on `document` existing at all: `refetchInterval` is evaluated during the
// server render too, where reading `document.visibilityState` threw outright.
function watching() {
  return typeof document !== "undefined" && document.visibilityState !== "hidden";
}

export const documentationKey = (projectId: string) =>
  ["projects", projectId, "documentation"] as const;
export const documentsKey = (projectId: string) =>
  [...documentationKey(projectId), "documents"] as const;
export const documentKey = (projectId: string, documentId: string) =>
  [...documentationKey(projectId), "documents", "detail", documentId] as const;
// Cursor pages, read to the end. Every one of these endpoints returns a
// `nextCursor` that used to be discarded, so a project past its first page had
// documents, source items and clarifications it simply could not reach — while
// the header went on counting them.
export function useDocumentationDocuments(projectId: string) {
  return useInfiniteQuery({
    queryKey: documentsKey(projectId),
    queryFn: ({ pageParam }) => listDocuments(projectId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    // Flattened so a consumer reads one list, exactly as it did before paging
    // existed; `fetchNextPage`/`hasNextPage` stay on the query result.
    select: (data) => ({
      items: data.pages.flatMap((page) => page.items),
      total: data.pages[0]?.total ?? 0,
    }),
    refetchInterval: (query) => {
      if (!watching()) return false;
      const hasActiveDocument = query.state.data?.pages.some((page) =>
        page.items.some(({ status }) =>
        [
          "received",
          "extracting",
          "ready_to_consolidate",
          "incorporating",
          "retrying",
          "removal_pending",
        ].includes(status),
        ),
      );
      return hasActiveDocument ? 3_000 : false;
    },
    refetchOnWindowFocus: true,
  });
}

export function useSourceDocument(projectId: string, documentId: string) {
  return useQuery({
    queryKey: documentKey(projectId, documentId),
    queryFn: () => getDocument(projectId, documentId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status &&
        [
          "received",
          "extracting",
          "ready_to_consolidate",
          "incorporating",
          "retrying",
        ].includes(status)
        ? 3_000
        : false;
    },
  });
}

// `documentsKey` is owned by an infinite query, so the cache entry is
// `{ pages, pageParams }` — not a bare page. Writing the flat shape here threw
// inside `onSuccess`, which React Query treats as a failed mutation: the
// upload had already succeeded, but the dialog reported a generic error and
// stayed open. The natural response is to upload again, and the duplicate is
// then consolidated into the canonical source — the one artefact the product
// promises is trustworthy.
function mergeAcknowledgement(
  current: InfiniteData<CursorPage<SourceDocument>> | undefined,
  document: SourceDocument,
): InfiniteData<CursorPage<SourceDocument>> | undefined {
  if (!current) return undefined;
  const [first, ...rest] = current.pages;
  if (!first) return current;
  if (current.pages.some((page) => page.items.some(({ id }) => id === document.id)))
    return current;
  return {
    ...current,
    pages: [
      { ...first, items: [document, ...first.items], total: first.total + 1 },
      ...rest,
    ],
  };
}

export function useUploadDocument(projectId: string) {
  const t = useTranslations("Projects.DocumentationNew.Toasts");
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadDocument(projectId, file),
    meta: { skipGlobalErrorToast: true, successMessage: t("documentAdded") },
    onSuccess: ({ document }) => {
      queryClient.setQueryData<InfiniteData<CursorPage<SourceDocument>>>(
        documentsKey(projectId),
        (current) => mergeAcknowledgement(current, document),
      );
    },
  });
}

export function useAddNotionDocument(projectId: string) {
  const t = useTranslations("Projects.DocumentationNew.Toasts");
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { pageUrl: string }) =>
      addNotionDocument(projectId, data),
    meta: { skipGlobalErrorToast: true, successMessage: t("documentAdded") },
    onSuccess: ({ document }) => {
      queryClient.setQueryData<InfiniteData<CursorPage<SourceDocument>>>(
        documentsKey(projectId),
        (current) => mergeAcknowledgement(current, document),
      );
    },
  });
}

export const workspaceKey = (projectId: string) =>
  [...documentationKey(projectId), "workspace"] as const;
export const publicClientSectionsKey = (projectId: string) =>
  [...documentationKey(projectId), "public-client-sections"] as const;

export function useDocumentationWorkspace(projectId: string) {
  return useQuery({
    queryKey: workspaceKey(projectId),
    queryFn: () => getDocumentationWorkspace(projectId),
    refetchInterval: (query) =>
      watching() ? (query.state.data?.refreshAfterMs ?? 5_000) : false,
    refetchOnWindowFocus: true,
  });
}

function useInvalidateDocumentation(projectId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: documentationKey(projectId) });
    queryClient.invalidateQueries({
      queryKey: publicClientSectionsKey(projectId),
    });
  };
}
export function usePublicClientSections(projectId: string) {
  return useQuery({
    queryKey: publicClientSectionsKey(projectId),
    queryFn: () => getPublicClientSections(projectId),
  });
}

export function useDocumentRemovalPreview(
  projectId: string,
  documentId: string | null,
) {
  return useQuery({
    queryKey: [...documentsKey(projectId), "removal-preview", documentId],
    queryFn: () => previewDocumentRemoval(projectId, documentId!),
    enabled: Boolean(documentId),
  });
}
export function useConfirmDocumentRemoval(projectId: string) {
  const t = useTranslations("Projects.DocumentationNew.Toasts");
  const invalidate = useInvalidateDocumentation(projectId);
  return useMutation({
    mutationFn: (input: {
      documentId: string;
      data: Parameters<typeof confirmDocumentRemoval>[2];
    }) => confirmDocumentRemoval(projectId, input.documentId, input.data),
    onSuccess: invalidate,
    meta: { skipGlobalErrorToast: true, successMessage: t("documentRemoved") },
  });
}
// ─── Author-defined client sections (specs/017) ───────────────────────────────

export const sectionsKey = (projectId: string) =>
  [...documentationKey(projectId), "sections"] as const;
export const sectionProposalKey = (projectId: string, sectionId: string) =>
  [...sectionsKey(projectId), sectionId, "proposal"] as const;

// A composition has no completion event to listen for, so the list polls while
// any section is busy and stops as soon as none is. Without this the page
// contradicted itself: the proposal panel polled and showed finished content
// while the row beside it still read "being written", because nothing told the
// list to look again.
export function useSections(projectId: string) {
  return useQuery({
    queryKey: sectionsKey(projectId),
    queryFn: () => listSections(projectId),
    refetchInterval: (query) =>
      watching() &&
      query.state.data?.sections.some(
        (section) => section.activeProposal?.status === "composing",
      )
        ? 3_000
        : false,
  });
}

export function useSectionProposal(projectId: string, sectionId: string) {
  return useQuery({
    queryKey: sectionProposalKey(projectId, sectionId),
    queryFn: () => getSectionProposal(projectId, sectionId),
    // A hidden tab is nobody watching. Left unguarded this kept one request
    // every three seconds per composing section, for a screen no one was on —
    // the guard the two other polling queries in this file already carry.
    refetchInterval: (query) =>
      watching() && query.state.data?.status === "composing" ? 3_000 : false,
  });
}

export function useCreateSection(projectId: string) {
  const t = useTranslations("Projects.Documentation.Sections.Toasts");
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSectionRequest) => createSection(projectId, body),
    meta: { skipGlobalErrorToast: true, successMessage: t("created") },
    onSuccess: (section) => {
      queryClient.invalidateQueries({ queryKey: sectionsKey(projectId) });
      queryClient.invalidateQueries({ queryKey: workspaceKey(projectId) });
      // Defining a section writes it, so the proposal the row is about to show
      // has to be read again rather than served from an empty cache.
      queryClient.invalidateQueries({
        queryKey: sectionProposalKey(projectId, section.id),
      });
    },
  });
}

export function useUpdateSection(projectId: string, sectionId: string) {
  const t = useTranslations("Projects.Documentation.Sections.Toasts");
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateSectionRequest) =>
      updateSection(projectId, sectionId, body),
    meta: { skipGlobalErrorToast: true, successMessage: t("updated") },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sectionsKey(projectId) });
      queryClient.invalidateQueries({
        queryKey: sectionProposalKey(projectId, sectionId),
      });
    },
  });
}

export function useArchiveSection(projectId: string) {
  const t = useTranslations("Projects.Documentation.Sections.Toasts");
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sectionId: string) => archiveSection(projectId, sectionId),
    meta: { skipGlobalErrorToast: true, successMessage: t("archived") },
    onSuccess: (_result, sectionId) => {
      // A rubrique's proposal key sits under the list's, so invalidating the
      // list invalidates the deleted rubrique's proposal too — which refetched,
      // 404'd, and raised a global "Not Found" on a deletion that had worked.
      // Dropped rather than refreshed: there is nothing left to read.
      queryClient.removeQueries({
        queryKey: sectionProposalKey(projectId, sectionId),
      });
      queryClient.invalidateQueries({ queryKey: sectionsKey(projectId) });
      queryClient.invalidateQueries({
        queryKey: publicClientSectionsKey(projectId),
      });
    },
  });
}

export function useComposeSection(projectId: string) {
  const t = useTranslations("Projects.Documentation.Sections.Toasts");
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sectionId: string) => composeSection(projectId, sectionId),
    meta: { skipGlobalErrorToast: true, successMessage: t("composing") },
    onSuccess: (_result, sectionId) => {
      queryClient.invalidateQueries({ queryKey: sectionsKey(projectId) });
      queryClient.invalidateQueries({
        queryKey: sectionProposalKey(projectId, sectionId),
      });
    },
  });
}

// A roadmap is corrected in place rather than by writing a note and asking for
// the whole thing again: a wrong date is fixed by fixing it.
export function useReplaceMilestones(projectId: string, sectionId: string) {
  const t = useTranslations("Projects.Documentation.Sections.Toasts");
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ReplaceMilestonesRequest) =>
      replaceMilestones(projectId, sectionId, body),
    meta: { skipGlobalErrorToast: true, successMessage: t("milestonesSaved") },
    onSuccess: (proposal) => {
      queryClient.setQueryData(
        sectionProposalKey(projectId, sectionId),
        proposal,
      );
      queryClient.invalidateQueries({ queryKey: sectionsKey(projectId) });
    },
  });
}

// Not a revision and not a publication: the client sees this the moment it is
// saved, which is why the published view is invalidated with the section list.
export function useSetCurrentMilestone(projectId: string, sectionId: string) {
  const t = useTranslations("Projects.Documentation.Sections.Toasts");
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SetCurrentMilestoneRequest) =>
      setCurrentMilestone(projectId, sectionId, body),
    meta: { skipGlobalErrorToast: true, successMessage: t("positionMoved") },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sectionsKey(projectId) });
      queryClient.invalidateQueries({
        queryKey: publicClientSectionsKey(projectId),
      });
    },
  });
}

export function useApproveSectionProposal(
  projectId: string,
  sectionId: string,
) {
  const t = useTranslations("Projects.Documentation.Sections.Toasts");
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (expectedVersion: number) =>
      approveSectionProposal(projectId, sectionId, expectedVersion),
    meta: { skipGlobalErrorToast: true, successMessage: t("approved") },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sectionsKey(projectId) });
      queryClient.invalidateQueries({
        queryKey: sectionProposalKey(projectId, sectionId),
      });
      queryClient.invalidateQueries({
        queryKey: publicClientSectionsKey(projectId),
      });
      queryClient.invalidateQueries({ queryKey: workspaceKey(projectId) });
    },
  });
}

// ─── The reference document (specs/018) ───────────────────────────────────────

export const referenceSummaryKey = (projectId: string) =>
  [...documentationKey(projectId), "reference", "summary"] as const;
export const referenceDocumentKey = (projectId: string) =>
  [...documentationKey(projectId), "reference", "document"] as const;

// Writing has no completion event, so both queries poll while it runs and stop
// as soon as it does not — and neither polls a tab nobody is looking at.
const whileWriting = (writing: boolean) => (writing && watching() ? 3_000 : false);

export function useReferenceSummary(projectId: string) {
  return useQuery({
    queryKey: referenceSummaryKey(projectId),
    queryFn: () => getReferenceSummary(projectId),
    refetchInterval: (query) =>
      whileWriting(query.state.data?.document?.status === "writing"),
  });
}

export function useReferenceDocument(projectId: string) {
  return useQuery({
    queryKey: referenceDocumentKey(projectId),
    queryFn: () => getReferenceDocument(projectId),
    refetchInterval: (query) =>
      whileWriting(query.state.data?.status === "writing"),
  });
}

export function useWriteReferenceDocument(projectId: string) {
  const t = useTranslations("Projects.Documentation.Reference.Toasts");
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => writeReferenceDocument(projectId),
    meta: { skipGlobalErrorToast: true, successMessage: t("writing") },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: referenceSummaryKey(projectId) });
      queryClient.invalidateQueries({
        queryKey: referenceDocumentKey(projectId),
      });
    },
  });
}

export const notesKey = (projectId: string) =>
  [...documentationKey(projectId), "reference", "notes"] as const;

export function useNotes(projectId: string) {
  return useQuery({
    queryKey: notesKey(projectId),
    queryFn: () => listNotes(projectId),
  });
}

// A note owes a rewrite, it never triggers one: the developer answers several
// points, corrects a paragraph or two, and rewrites once when they are done
// (FR-006). Only the summary is refreshed, so the badge counts what is owed.
export function useAddNote(projectId: string) {
  const t = useTranslations("Projects.Documentation.Reference.Toasts");
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: AddNoteRequest) => addNote(projectId, data),
    meta: { skipGlobalErrorToast: true, successMessage: t("noteAdded") },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notesKey(projectId) });
      queryClient.invalidateQueries({ queryKey: referenceSummaryKey(projectId) });
    },
  });
}

export function useRemoveNote(projectId: string) {
  const t = useTranslations("Projects.Documentation.Reference.Toasts");
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (noteId: string) => removeNote(projectId, noteId),
    meta: { skipGlobalErrorToast: true, successMessage: t("noteRemoved") },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notesKey(projectId) });
      queryClient.invalidateQueries({ queryKey: referenceSummaryKey(projectId) });
    },
  });
}
