"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";
import type {
  EditorialProfileValues,
  GuidedCorrectionRequest,
  SourceDocument,
} from "schemas";
import {
  addNotionDocument,
  CanonicalSourceOptions,
  confirmWorkingLanguage,
  correctSourceItem,
  CursorPage,
  getCanonicalSource,
  getDocument,
  getItemProvenance,
  listDocuments,
  proposeWorkingLanguage,
  uploadDocument,
  ClarificationOptions,
  listClarifications,
  resolveClarifications,
  cancelEditorialProfile,
  confirmEditorialProfile,
  correctCategoryDraft,
  getCategoryDraft,
  getClientContentPreview,
  getPublicClientCategories,
  getDocumentationWorkspace,
  getEditorialProfile,
  listCategoryDrafts,
  proposeEditorialProfile,
  reviewCategoryDraft,
  confirmDocumentRemoval,
  previewDocumentRemoval,
  retryDocumentRemoval,
  retryDocumentProcessing,
} from "./api";
import type { ResolveClarificationsRequest } from "schemas";

export const documentationKey = (projectId: string) =>
  ["projects", projectId, "documentation"] as const;
export const documentsKey = (projectId: string) =>
  [...documentationKey(projectId), "documents"] as const;
export const documentKey = (projectId: string, documentId: string) =>
  [...documentationKey(projectId), "documents", "detail", documentId] as const;
export const canonicalSourceKey = (
  projectId: string,
  options: CanonicalSourceOptions,
) =>
  [
    ...documentationKey(projectId),
    "source",
    options.revisionId ?? null,
  ] as const;
export const provenanceKey = (
  projectId: string,
  itemId: string,
  revisionId?: string,
) =>
  [
    ...documentationKey(projectId),
    "provenance",
    itemId,
    revisionId ?? null,
  ] as const;
export const clarificationsKey = (
  projectId: string,
  options: ClarificationOptions = {},
) =>
  [
    ...documentationKey(projectId),
    "clarifications",
    options.status ?? null,
    options.categoryKey ?? null,
  ] as const;

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
      if (document.visibilityState === "hidden") return false;
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

export function useRetryDocumentProcessing(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) =>
      retryDocumentProcessing(projectId, documentId),
    meta: { skipGlobalErrorToast: true },
    onSuccess: (_result, documentId) => {
      queryClient.invalidateQueries({
        queryKey: documentKey(projectId, documentId),
      });
      queryClient.invalidateQueries({ queryKey: documentsKey(projectId) });
      queryClient.invalidateQueries({ queryKey: workspaceKey(projectId) });
    },
  });
}

export function useCanonicalSource(
  projectId: string,
  options: CanonicalSourceOptions = {},
) {
  return useInfiniteQuery({
    queryKey: canonicalSourceKey(projectId, options),
    queryFn: ({ pageParam }) =>
      getCanonicalSource(projectId, { ...options, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    select: (data) => ({
      ...data.pages[0],
      items: data.pages.flatMap((page) => page.items),
    }),
  });
}

export function useSourceItemProvenance(
  projectId: string,
  itemId: string,
  revisionId?: string,
) {
  return useQuery({
    queryKey: provenanceKey(projectId, itemId, revisionId),
    queryFn: () => getItemProvenance(projectId, itemId, revisionId),
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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadDocument(projectId, file),
    meta: { skipGlobalErrorToast: true },
    onSuccess: ({ document }) => {
      queryClient.setQueryData<InfiniteData<CursorPage<SourceDocument>>>(
        documentsKey(projectId),
        (current) => mergeAcknowledgement(current, document),
      );
    },
  });
}

export function useAddNotionDocument(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { pageUrl: string }) =>
      addNotionDocument(projectId, data),
    meta: { skipGlobalErrorToast: true },
    onSuccess: ({ document }) => {
      queryClient.setQueryData<InfiniteData<CursorPage<SourceDocument>>>(
        documentsKey(projectId),
        (current) => mergeAcknowledgement(current, document),
      );
    },
  });
}

export function useSourceItemCorrection(projectId: string, itemId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: GuidedCorrectionRequest) =>
      correctSourceItem(projectId, itemId, data),
    meta: { skipGlobalErrorToast: true },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: canonicalSourceKey(projectId, {}),
      });
      queryClient.invalidateQueries({
        queryKey: provenanceKey(projectId, itemId),
      });
    },
  });
}

export function useProposeWorkingLanguage(projectId: string) {
  return useMutation({
    mutationFn: (data: {
      expectedSourceRevisionId: string | null;
      language: "en" | "fr";
    }) => proposeWorkingLanguage(projectId, data),
    meta: { skipGlobalErrorToast: true },
  });
}

export function useConfirmWorkingLanguage(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (proposalId: string) =>
      confirmWorkingLanguage(projectId, proposalId),
    meta: { skipGlobalErrorToast: true },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: canonicalSourceKey(projectId, {}),
      });
    },
  });
}

export function useClarifications(
  projectId: string,
  options: ClarificationOptions = {},
) {
  return useInfiniteQuery({
    queryKey: clarificationsKey(projectId, options),
    queryFn: ({ pageParam }) =>
      listClarifications(projectId, { ...options, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    select: (data) => ({
      items: data.pages.flatMap((page) => page.items),
      total: data.pages[0]?.total ?? 0,
    }),
  });
}

export function useResolveClarifications(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ResolveClarificationsRequest) =>
      resolveClarifications(projectId, data),
    meta: { skipGlobalErrorToast: true },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...documentationKey(projectId), "clarifications"],
      });
      queryClient.invalidateQueries({
        queryKey: canonicalSourceKey(projectId, {}),
      });
    },
  });
}

export const workspaceKey = (projectId: string) =>
  [...documentationKey(projectId), "workspace"] as const;
export const categoryDraftsKey = (projectId: string) =>
  [...documentationKey(projectId), "category-drafts"] as const;
export const clientPreviewKey = (projectId: string) =>
  [...documentationKey(projectId), "client-preview"] as const;
export const publicClientCategoriesKey = (projectId: string) =>
  [...documentationKey(projectId), "public-client-categories"] as const;
export const editorialProfileKey = (projectId: string) =>
  [...documentationKey(projectId), "editorial-profile"] as const;

export function useDocumentationWorkspace(projectId: string) {
  return useQuery({
    queryKey: workspaceKey(projectId),
    queryFn: () => getDocumentationWorkspace(projectId),
    refetchInterval: (query) =>
      document.visibilityState === "hidden"
        ? false
        : (query.state.data?.refreshAfterMs ?? 5_000),
    refetchOnWindowFocus: true,
  });
}

export function useCategoryDrafts(projectId: string) {
  return useQuery({
    queryKey: categoryDraftsKey(projectId),
    queryFn: () => listCategoryDrafts(projectId),
    // A draft with no summary yet is still being generated. Without this it
    // showed "Génération en cours" and then stayed frozen on that text until
    // the contributor thought to reload the page by hand.
    refetchInterval: (query) =>
      query.state.data?.some((state) => state.activeDraft?.changeSummary == null)
        ? 5_000
        : false,
  });
}
export function useCategoryDraft(projectId: string, draftId: string | null) {
  return useQuery({
    queryKey: [...categoryDraftsKey(projectId), draftId],
    queryFn: () => getCategoryDraft(projectId, draftId!),
    enabled: Boolean(draftId),
  });
}

function useInvalidateDocumentation(projectId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: documentationKey(projectId) });
    queryClient.invalidateQueries({ queryKey: clientPreviewKey(projectId) });
  };
}
export function useReviewCategoryDraft(projectId: string) {
  const invalidate = useInvalidateDocumentation(projectId);
  return useMutation({
    mutationFn: (input: {
      draftId: string;
      action: "accept" | "discard";
      expectedVersion: number;
    }) =>
      reviewCategoryDraft(
        projectId,
        input.draftId,
        input.action,
        input.expectedVersion,
      ),
    onSuccess: invalidate,
    meta: { skipGlobalErrorToast: true },
  });
}
export function useCorrectCategoryDraft(projectId: string) {
  const invalidate = useInvalidateDocumentation(projectId);
  return useMutation({
    mutationFn: (input: {
      draftId: string;
      expectedVersion: number;
      instruction: string;
    }) =>
      correctCategoryDraft(
        projectId,
        input.draftId,
        input.expectedVersion,
        input.instruction,
      ),
    onSuccess: invalidate,
    meta: { skipGlobalErrorToast: true },
  });
}
export function useClientContentPreview(projectId: string) {
  return useQuery({
    queryKey: clientPreviewKey(projectId),
    queryFn: () => getClientContentPreview(projectId),
  });
}
export function usePublicClientCategories(projectId: string) {
  return useQuery({
    queryKey: publicClientCategoriesKey(projectId),
    queryFn: () => getPublicClientCategories(projectId),
  });
}
export function useEditorialProfile(projectId: string) {
  return useQuery({
    queryKey: editorialProfileKey(projectId),
    queryFn: () => getEditorialProfile(projectId),
    refetchInterval: (query) =>
      query.state.data?.proposal?.status === "preview_pending" ? 5_000 : false,
  });
}
export function useProposeEditorialProfile(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      expectedVersion: number;
      values: EditorialProfileValues;
    }) =>
      proposeEditorialProfile(projectId, input.expectedVersion, input.values),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: editorialProfileKey(projectId),
      }),
    meta: { skipGlobalErrorToast: true },
  });
}
export function useConfirmEditorialProfile(projectId: string) {
  const invalidate = useInvalidateDocumentation(projectId);
  return useMutation({
    mutationFn: (input: { proposalId: string; expectedVersion: number }) =>
      confirmEditorialProfile(
        projectId,
        input.proposalId,
        input.expectedVersion,
      ),
    onSuccess: invalidate,
    meta: { skipGlobalErrorToast: true },
  });
}
export function useCancelEditorialProfile(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { proposalId: string; expectedVersion: number }) =>
      cancelEditorialProfile(
        projectId,
        input.proposalId,
        input.expectedVersion,
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: editorialProfileKey(projectId),
      }),
    meta: { skipGlobalErrorToast: true },
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
  const invalidate = useInvalidateDocumentation(projectId);
  return useMutation({
    mutationFn: (input: {
      documentId: string;
      data: Parameters<typeof confirmDocumentRemoval>[2];
    }) => confirmDocumentRemoval(projectId, input.documentId, input.data),
    onSuccess: invalidate,
    meta: { skipGlobalErrorToast: true },
  });
}
export function useRetryDocumentRemoval(projectId: string) {
  const invalidate = useInvalidateDocumentation(projectId);
  return useMutation({
    mutationFn: (documentId: string) =>
      retryDocumentRemoval(projectId, documentId),
    onSuccess: invalidate,
    meta: { skipGlobalErrorToast: true },
  });
}
