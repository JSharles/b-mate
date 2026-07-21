import type { CreateProjectRequest, Project, ProjectMember } from "schemas";
import { apiFetch } from "@/shared/lib/api-client";

export function listProjects() {
  return apiFetch<Project[]>("/projects");
}

export function createProject(data: CreateProjectRequest) {
  return apiFetch<Project>("/projects", { method: "POST", body: data });
}

export function getProject(id: string) {
  return apiFetch<Project>(`/projects/${id}`);
}

export function listProjectMembers(projectId: string) {
  return apiFetch<ProjectMember[]>(`/projects/${projectId}/members`);
}

export function removeProjectMember(projectId: string, userId: string) {
  return apiFetch<void>(`/projects/${projectId}/members/${userId}`, { method: "DELETE" });
}
