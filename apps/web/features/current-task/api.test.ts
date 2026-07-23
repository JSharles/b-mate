import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/shared/lib/api-client";
import { getCurrentTask } from "./api";

vi.mock("@/shared/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);

describe("features/current-task/api", () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it("getCurrentTask gets /projects/:id/current-task", async () => {
    mockedApiFetch.mockResolvedValue([]);

    await getCurrentTask("project-1");

    expect(mockedApiFetch).toHaveBeenCalledWith("/projects/project-1/current-task");
  });
});
