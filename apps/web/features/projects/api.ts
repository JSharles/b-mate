import type { CreateProjectRequest, Project } from "schemas";
import { apiFetch } from "@/shared/lib/api-client";

export function listProjects() {
  return apiFetch<Project[]>("/projects");
}

export function createProject(data: CreateProjectRequest) {
  return apiFetch<Project>("/projects", { method: "POST", body: data });
}
