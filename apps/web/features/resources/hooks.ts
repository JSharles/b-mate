"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import type { CreateResourceNotionRequest } from "schemas";
import {
  approveResourceCategory,
  connectNotionResource,
  deleteResource,
  getResource,
  getResources,
  publishResource,
  rejectResourceCategory,
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

// Mirrors usePublishResource's shape — a category assignment is scoped to
// one resource, so both the resource's own detail entry and the project's
// resource list (client-facing tabs group by category there) need
// invalidating on success.
export function useApproveResourceCategory(projectId: string) {
  const queryClient = useQueryClient();
  const locale = useLocale();

  return useMutation({
    mutationFn: (vars: { resourceId: string; categoryAssignmentId: string }) =>
      approveResourceCategory(projectId, vars.resourceId, vars.categoryAssignmentId),
    meta: { skipGlobalErrorToast: true },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: resourcesKey(projectId, locale) });
      queryClient.invalidateQueries({
        queryKey: resourceKey(projectId, vars.resourceId, locale),
      });
    },
  });
}

export function useRejectResourceCategory(projectId: string) {
  const queryClient = useQueryClient();
  const locale = useLocale();

  return useMutation({
    mutationFn: (vars: { resourceId: string; categoryAssignmentId: string }) =>
      rejectResourceCategory(projectId, vars.resourceId, vars.categoryAssignmentId),
    meta: { skipGlobalErrorToast: true },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: resourcesKey(projectId, locale) });
      queryClient.invalidateQueries({
        queryKey: resourceKey(projectId, vars.resourceId, locale),
      });
    },
  });
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
