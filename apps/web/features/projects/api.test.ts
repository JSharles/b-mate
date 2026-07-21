import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/shared/lib/api-client";
import { createProject, listProjects } from "./api";

vi.mock("@/shared/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);

describe("features/projects/api", () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it("listProjects gets /projects", async () => {
    mockedApiFetch.mockResolvedValue([]);

    await listProjects();

    expect(mockedApiFetch).toHaveBeenCalledWith("/projects");
  });

  it("createProject posts to /projects", async () => {
    mockedApiFetch.mockResolvedValue({ id: "1" });
    const data = { title: "My project" };

    await createProject(data);

    expect(mockedApiFetch).toHaveBeenCalledWith("/projects", { method: "POST", body: data });
  });
});
