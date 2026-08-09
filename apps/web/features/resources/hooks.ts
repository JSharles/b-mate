"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import type { CreateResourceNotionRequest, ResourceCategoryKey } from "schemas";
import {
  approveResourceSection,
  connectNotionResource,
  deleteResource,
  getResource,
  getResources,
  moveResourceSection,
  publishResource,
  rejectResourceSection,
  uploadResource,
} from "./api";

export const resourcesKey = (projectId: string, locale: string) =>
  ["projects", projectId, "resources", locale] as const;

export const resourceKey = (projectId: string, resourceId: string, locale: string) =>
  ["projects", projectId, "resources", resourceId, locale] as const;

export function useResources(projectId: string) {
  const locale = useLocale();

  return useQuery({
    queryKey: resourcesKey(projectId, locale),
    queryFn: () => getResources(projectId, locale),
  });
}

export function useResource(projectId: string, resourceId: string) {
  const locale = useLocale();

  return useQuery({
    queryKey: resourceKey(projectId, resourceId, locale),
    queryFn: () => getResource(projectId, resourceId, locale),
  });
}

export function useUploadResource(projectId: string) {
  const queryClient = useQueryClient();
  const locale = useLocale();

  return useMutation({
    mutationFn: (file: File) => uploadResource(projectId, file),
    meta: { skipGlobalErrorToast: true },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: resourcesKey(projectId, locale) });
    },
  });
}

export function usePublishResource(projectId: string) {
  const queryClient = useQueryClient();
  const locale = useLocale();

  return useMutation({
    mutationFn: (resourceId: string) => publishResource(projectId, resourceId),
    meta: { skipGlobalErrorToast: true },
    onSuccess: (_data, resourceId) => {
      queryClient.invalidateQueries({ queryKey: resourcesKey(projectId, locale) });
      queryClient.invalidateQueries({ queryKey: resourceKey(projectId, resourceId, locale) });
    },
  });
}

export function useConnectNotionResource(projectId: string) {
  const queryClient = useQueryClient();
  const locale = useLocale();

  return useMutation({
    mutationFn: (data: CreateResourceNotionRequest) => connectNotionResource(projectId, data),
    meta: { skipGlobalErrorToast: true },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: resourcesKey(projectId, locale) });
    },
  });
}

// Mirrors usePublishResource's shape — a section belongs to one resource, so
// both that resource's own detail entry and the project's resource list (the
// client's category tabs are built from it) need invalidating on success.
function useSectionMutation<TVars extends { resourceId: string }>(
  projectId: string,
  mutationFn: (vars: TVars) => Promise<void>,
) {
  const queryClient = useQueryClient();
  const locale = useLocale();

  return useMutation({
    mutationFn,
    meta: { skipGlobalErrorToast: true },
    onSuccess: (_data: void, vars: TVars) => {
      queryClient.invalidateQueries({ queryKey: resourcesKey(projectId, locale) });
      queryClient.invalidateQueries({
        queryKey: resourceKey(projectId, vars.resourceId, locale),
      });
    },
  });
}

export function useApproveResourceSection(projectId: string) {
  return useSectionMutation(projectId, (vars: { resourceId: string; sectionId: string }) =>
    approveResourceSection(projectId, vars.resourceId, vars.sectionId),
  );
}

export function useRejectResourceSection(projectId: string) {
  return useSectionMutation(projectId, (vars: { resourceId: string; sectionId: string }) =>
    rejectResourceSection(projectId, vars.resourceId, vars.sectionId),
  );
}

export function useMoveResourceSection(projectId: string) {
  return useSectionMutation(
    projectId,
    (vars: { resourceId: string; sectionId: string; categoryKey: ResourceCategoryKey }) =>
      moveResourceSection(projectId, vars.resourceId, vars.sectionId, vars.categoryKey),
  );
}

export function useDeleteResource(projectId: string) {
  const queryClient = useQueryClient();
  const locale = useLocale();

  return useMutation({
    mutationFn: (resourceId: string) => deleteResource(projectId, resourceId),
    meta: { skipGlobalErrorToast: true },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: resourcesKey(projectId, locale) });
    },
  });
}
