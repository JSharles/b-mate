import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/shared/lib/api-client";
import { acceptInvitation, createInvitation, getInvitationByToken, listInvitations } from "./api";

vi.mock("@/shared/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);

describe("features/invitations/api", () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it("listInvitations gets /projects/:id/invitations", async () => {
    mockedApiFetch.mockResolvedValue([]);

    await listInvitations("project-1");

    expect(mockedApiFetch).toHaveBeenCalledWith("/projects/project-1/invitations");
  });

  it("createInvitation posts to /projects/:id/invitations", async () => {
    mockedApiFetch.mockResolvedValue({ id: "1" });
    const data = { email: "client@example.com" };

    await createInvitation("project-1", data);

    expect(mockedApiFetch).toHaveBeenCalledWith("/projects/project-1/invitations", {
      method: "POST",
      body: data,
    });
  });

  it("getInvitationByToken gets /invitations/:token", async () => {
    mockedApiFetch.mockResolvedValue({ email: "client@example.com" });

    await getInvitationByToken("the-token");

    expect(mockedApiFetch).toHaveBeenCalledWith("/invitations/the-token");
  });

  it("acceptInvitation posts to /invitations/:token/accept", async () => {
    mockedApiFetch.mockResolvedValue({ id: "1" });
    const data = { password: "supersecret123" };

    await acceptInvitation("the-token", data);

    expect(mockedApiFetch).toHaveBeenCalledWith("/invitations/the-token/accept", {
      method: "POST",
      body: data,
    });
  });
});
