import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { currentUserKey } from "@/shared/hooks/use-current-user";
import { ApiError } from "@/shared/lib/api-client";
import {
  acceptInvitation,
  createInvitation,
  getInvitationByToken,
  listInvitations,
} from "./api";
import {
  invitationsKey,
  useAcceptInvitation,
  useCreateInvitation,
  useInvitationDetails,
  useInvitations,
} from "./hooks";

vi.mock("./api", () => ({
  listInvitations: vi.fn(),
  createInvitation: vi.fn(),
  getInvitationByToken: vi.fn(),
  acceptInvitation: vi.fn(),
}));

const push = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push }),
}));

const mockedListInvitations = vi.mocked(listInvitations);
const mockedCreateInvitation = vi.mocked(createInvitation);
const mockedGetInvitationByToken = vi.mocked(getInvitationByToken);
const mockedAcceptInvitation = vi.mocked(acceptInvitation);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    queryClient,
    Wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

const fakeInvitation = { id: "1", email: "client@example.com" } as never;
const fakeUser = { id: "1", email: "client@example.com" } as never;

describe("invitations hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("useInvitations returns the list of invitations for the project", async () => {
    mockedListInvitations.mockResolvedValue([fakeInvitation]);
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useInvitations("project-1"), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedListInvitations).toHaveBeenCalledWith("project-1");
    expect(result.current.data).toEqual([fakeInvitation]);
  });

  it("useCreateInvitation invalidates the invitations query for the project", async () => {
    mockedCreateInvitation.mockResolvedValue(fakeInvitation);
    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateInvitation("project-1"), { wrapper: Wrapper });
    act(() => {
      result.current.mutate({ email: "client@example.com" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedCreateInvitation).toHaveBeenCalledWith("project-1", {
      email: "client@example.com",
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: invitationsKey("project-1") });
  });

  describe("useInvitationDetails", () => {
    it("returns the invitation details for a valid token", async () => {
      const details = {
        email: "client@example.com",
        projectTitle: "Site vitrine client X",
        accountExists: false,
        status: "invited",
      };
      mockedGetInvitationByToken.mockResolvedValue(details as never);
      const { Wrapper } = createWrapper();

      const { result } = renderHook(() => useInvitationDetails("the-token"), {
        wrapper: Wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(details);
    });

    it("resolves to null (not an error) for an unknown token", async () => {
      mockedGetInvitationByToken.mockRejectedValue(new ApiError("Invitation not found", 404));
      const { Wrapper } = createWrapper();

      const { result } = renderHook(() => useInvitationDetails("missing-token"), {
        wrapper: Wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBeNull();
    });

    it("still surfaces a non-404 error", async () => {
      mockedGetInvitationByToken.mockRejectedValue(new ApiError("Server error", 500));
      const { Wrapper } = createWrapper();

      const { result } = renderHook(() => useInvitationDetails("the-token"), {
        wrapper: Wrapper,
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe("useAcceptInvitation", () => {
    it("caches the user and redirects to /home", async () => {
      mockedAcceptInvitation.mockResolvedValue(fakeUser);
      const { Wrapper, queryClient } = createWrapper();

      const { result } = renderHook(() => useAcceptInvitation("the-token"), { wrapper: Wrapper });
      act(() => {
        result.current.mutate({ password: "supersecret123" });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockedAcceptInvitation).toHaveBeenCalledWith("the-token", {
        password: "supersecret123",
      });
      expect(queryClient.getQueryData(currentUserKey)).toBe(fakeUser);
      expect(push).toHaveBeenCalledWith("/home");
    });
  });
});
