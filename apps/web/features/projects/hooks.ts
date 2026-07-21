"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@/i18n/navigation";
import {
  createProject,
  getProject,
  listProjectMembers,
  listProjects,
  removeProjectMember,
} from "./api";

export const projectsKey = ["projects"] as const;
export const projectKey = (id: string) => ["projects", id] as const;
export const projectMembersKey = (projectId: string) =>
  ["projects", projectId, "members"] as const;

export function useProjects() {
  return useQuery({
    queryKey: projectsKey,
    queryFn: listProjects,
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: projectKey(id),
    queryFn: () => getProject(id),
  });
}

export function useProjectMembers(projectId: string) {
  return useQuery({
    queryKey: projectMembersKey(projectId),
    queryFn: () => listProjectMembers(projectId),
  });
}

export function useRemoveMember(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => removeProjectMember(projectId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectMembersKey(projectId) });
    },
  });
}

// Error is surfaced inline in the form (see CreateProjectForm), not as a
// generic toast — skipGlobalErrorToast opts this out of that default.
export function useCreateProject() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: createProject,
    meta: { skipGlobalErrorToast: true },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectsKey });
      router.push("/home");
    },
  });
}
