import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/shared/lib/api-client";
import { connectBoard, disconnectBoard, getBoardConnection, previewBoardConnection } from "./api";

vi.mock("@/shared/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);

describe("features/board-connections/api", () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it("getBoardConnection gets /projects/:id/board-connection", async () => {
    mockedApiFetch.mockResolvedValue({ provider: "github" });

    const result = await getBoardConnection("project-1");

    expect(mockedApiFetch).toHaveBeenCalledWith("/projects/project-1/board-connection");
    expect(result).toEqual({ provider: "github" });
  });

  it("getBoardConnection normalizes an undefined (empty-body) response to null", async () => {
    mockedApiFetch.mockResolvedValue(undefined);

    const result = await getBoardConnection("project-1");

    expect(result).toBeNull();
  });

  it("previewBoardConnection posts to /projects/:id/board-connection/preview", async () => {
    mockedApiFetch.mockResolvedValue([]);
    const data = { token: "a-token" };

    await previewBoardConnection("project-1", data);

    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/projects/project-1/board-connection/preview",
      { method: "POST", body: data },
    );
  });

  it("connectBoard posts to /projects/:id/board-connection", async () => {
    mockedApiFetch.mockResolvedValue({ provider: "github" });
    const data = {
      token: "a-token",
      ownerLogin: "acme",
      ownerType: "Organization" as const,
      number: 3,
    };

    await connectBoard("project-1", data);

    expect(mockedApiFetch).toHaveBeenCalledWith("/projects/project-1/board-connection", {
      method: "POST",
      body: data,
    });
  });

  it("disconnectBoard deletes /projects/:id/board-connection", async () => {
    mockedApiFetch.mockResolvedValue(undefined);

    await disconnectBoard("project-1");

    expect(mockedApiFetch).toHaveBeenCalledWith("/projects/project-1/board-connection", {
      method: "DELETE",
    });
  });
});
