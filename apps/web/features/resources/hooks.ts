"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import type { CreateResourceNotionRequest, ResourceCategoryKey } from "schemas";
import {
  acceptDraft,
  answerDraftQuestions,
  connectNotionResource,
  deleteResource,
  discardDraft,
  getCategoryContent,
  getReferenceDrafts,
  getResource,
  getResources,
  regenerateDraft,
  uploadResource,
} from "./api";

export const resourcesKey = (projectId: string) =>
  ["projects", projectId, "resources"] as const;

export const resourceKey = (projectId: string, resourceId: string) =>
  ["projects", projectId, "resources", resourceId] as const;

export const referenceDraftsKey = (projectId: string) =>
  ["projects", projectId, "reference-drafts"] as const;

export const categoryContentKey = (projectId: string, locale: string) =>
  ["projects", projectId, "category-content", locale] as const;

export function useResources(projectId: string) {
  return useQuery({
    queryKey: resourcesKey(projectId),
    queryFn: () => getResources(projectId),
  });
}

export function useResource(projectId: string, resourceId: string) {
  return useQuery({
    queryKey: resourceKey(projectId, resourceId),
    queryFn: () => getResource(projectId, resourceId),
  });
}

// The contributor's review queue (FR-014a). Independent items, one per
// category — acting on one never blocks another.
export function useReferenceDrafts(projectId: string) {
  return useQuery({
    queryKey: referenceDraftsKey(projectId),
    queryFn: () => getReferenceDrafts(projectId),
  });
}

// What a client reads.
export function useCategoryContent(projectId: string) {
  const locale = useLocale();

  return useQuery({
    queryKey: categoryContentKey(projectId, locale),
    queryFn: () => getCategoryContent(projectId, locale),
  });
}

export function useUploadResource(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => uploadResource(projectId, file),
    meta: { skipGlobalErrorToast: true },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: resourcesKey(projectId) });
    },
  });
}

export function useConnectNotionResource(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateResourceNotionRequest) => connectNotionResource(projectId, data),
    meta: { skipGlobalErrorToast: true },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: resourcesKey(projectId) });
    },
  });
}

// Every draft action changes the queue, and accepting one also changes what a
// client reads — so both are invalidated. The document list is invalidated too
// because deleting one is what triggers some of these drafts.
function useDraftMutation<TVars extends { categoryKey: ResourceCategoryKey }>(
  projectId: string,
  mutationFn: (vars: TVars) => Promise<void>,
) {
  const queryClient = useQueryClient();
  const locale = useLocale();

  return useMutation({
    mutationFn,
    meta: { skipGlobalErrorToast: true },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: referenceDraftsKey(projectId) });
      queryClient.invalidateQueries({
        queryKey: categoryContentKey(projectId, locale),
      });
    },
  });
}

export function useAcceptDraft(projectId: string) {
  return useDraftMutation(projectId, (vars: { categoryKey: ResourceCategoryKey }) =>
    acceptDraft(projectId, vars.categoryKey),
  );
}

export function useDiscardDraft(projectId: string) {
  return useDraftMutation(projectId, (vars: { categoryKey: ResourceCategoryKey }) =>
    discardDraft(projectId, vars.categoryKey),
  );
}

export function useRegenerateDraft(projectId: string) {
  return useDraftMutation(
    projectId,
    (vars: { categoryKey: ResourceCategoryKey; instruction: string }) =>
      regenerateDraft(projectId, vars.categoryKey, vars.instruction),
  );
}

// Answering feeds the next rebuild rather than editing the draft in place, so
// it invalidates the queue exactly like a correction does.
export function useAnswerDraftQuestions(projectId: string) {
  return useDraftMutation(
    projectId,
    (vars: {
      categoryKey: ResourceCategoryKey;
      answers: { questionId: string; answer: string }[];
    }) => answerDraftQuestions(projectId, vars.categoryKey, vars.answers),
  );
}

export function useDeleteResource(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (resourceId: string) => deleteResource(projectId, resourceId),
    meta: { skipGlobalErrorToast: true },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: resourcesKey(projectId) });
      // Deleting a document rebuilds the categories it fed, which lands in
      // the review queue.
      queryClient.invalidateQueries({ queryKey: referenceDraftsKey(projectId) });
    },
  });
}
