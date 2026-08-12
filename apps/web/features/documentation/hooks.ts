"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";
import type {
  GuidedCorrectionRequest,
  SourceDocument,
} from "schemas";
import {
  addNotionDocument,
  CanonicalSourceOptions,
  correctSourceItem,
  CursorPage,
  getCanonicalSource,
  getDocument,
  getItemProvenance,
  listDocuments,
  uploadDocument,
  ClarificationOptions,
  listClarifications,
  resolveClarifications,
  getClientContentPreview,
  getPublicClientSections,
  getDocumentationWorkspace,
  confirmDocumentRemoval,
  previewDocumentRemoval,
  retryDocumentRemoval,
  cancelDocumentProcessing,
  retryDocumentProcessing,
} from "./api";
import type { ResolveClarificationsRequest } from "schemas";
import { useTranslations } from "next-intl";

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

export function useCancelDocumentProcessing(projectId: string) {
  const t = useTranslations("Projects.DocumentationNew.Toasts");
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) =>
      cancelDocumentProcessing(projectId, documentId),
    meta: {
      skipGlobalErrorToast: true,
      successMessage: t("processingCancelled"),
    },
    onSuccess: (_result, documentId) => {
      queryClient.invalidateQueries({
        queryKey: documentKey(projectId, documentId),
      });
      queryClient.invalidateQueries({ queryKey: documentsKey(projectId) });
      queryClient.invalidateQueries({ queryKey: workspaceKey(projectId) });
    },
  });
}

export function useRetryDocumentProcessing(projectId: string) {
  const t = useTranslations("Projects.DocumentationNew.Toasts");
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) =>
      retryDocumentProcessing(projectId, documentId),
    meta: { skipGlobalErrorToast: true, successMessage: t("processingRetried") },
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

export function useSourceItemCorrection(projectId: string, itemId: string) {
  const t = useTranslations("Projects.DocumentationNew.Toasts");
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: GuidedCorrectionRequest) =>
      correctSourceItem(projectId, itemId, data),
    meta: { skipGlobalErrorToast: true, successMessage: t("correctionSent") },
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
  const t = useTranslations("Projects.DocumentationNew.Toasts");
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ResolveClarificationsRequest) =>
      resolveClarifications(projectId, data),
    meta: { skipGlobalErrorToast: true, successMessage: t("clarificationsAnswered") },
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
export const clientPreviewKey = (projectId: string) =>
  [...documentationKey(projectId), "client-preview"] as const;
export const publicClientSectionsKey = (projectId: string) =>
  [...documentationKey(projectId), "public-client-sections"] as const;

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


function useInvalidateDocumentation(projectId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: documentationKey(projectId) });
    queryClient.invalidateQueries({ queryKey: clientPreviewKey(projectId) });
  };
}
export function useClientContentPreview(projectId: string) {
  return useQuery({
    queryKey: clientPreviewKey(projectId),
    queryFn: () => getClientContentPreview(projectId),
  });
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
export function useRetryDocumentRemoval(projectId: string) {
  const t = useTranslations("Projects.DocumentationNew.Toasts");
  const invalidate = useInvalidateDocumentation(projectId);
  return useMutation({
    mutationFn: (documentId: string) =>
      retryDocumentRemoval(projectId, documentId),
    onSuccess: invalidate,
    meta: { skipGlobalErrorToast: true, successMessage: t("removalResumed") },
  });
}
