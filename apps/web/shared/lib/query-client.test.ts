import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { ApiError } from "./api-client";
import { setCurrentLocale } from "./current-locale";
import { getQueryClient } from "./query-client";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const mockedToast = vi.mocked(toast);

describe("getQueryClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setCurrentLocale("fr");
  });

  it("returns the same instance on repeated calls in the browser", () => {
    expect(getQueryClient()).toBe(getQueryClient());
  });

  it("shows an error toast with the ApiError message when a query fails", async () => {
    const queryClient = getQueryClient();

    await queryClient
      .fetchQuery({
        queryKey: ["boom"],
        queryFn: () => {
          throw new ApiError("Nope", 400);
        },
        retry: false,
      })
      .catch(() => undefined);

    expect(mockedToast.error).toHaveBeenCalledWith("Nope");
  });

  it("falls back to the current locale's generic message for non-ApiError failures", async () => {
    setCurrentLocale("en");
    const queryClient = getQueryClient();

    await queryClient
      .fetchQuery({
        queryKey: ["boom-generic"],
        queryFn: () => {
          throw new Error("raw failure");
        },
        retry: false,
      })
      .catch(() => undefined);

    expect(mockedToast.error).toHaveBeenCalledWith("Something went wrong");
  });

  it("uses the French generic message when that's the current locale", async () => {
    setCurrentLocale("fr");
    const queryClient = getQueryClient();

    await queryClient
      .fetchQuery({
        queryKey: ["boom-generic-fr"],
        queryFn: () => {
          throw new Error("raw failure");
        },
        retry: false,
      })
      .catch(() => undefined);

    expect(mockedToast.error).toHaveBeenCalledWith("Une erreur est survenue");
  });

  it("shows a success toast when a mutation sets meta.successMessage", async () => {
    const queryClient = getQueryClient();

    await queryClient
      .getMutationCache()
      .build(queryClient, {
        mutationFn: () => Promise.resolve("ok"),
        meta: { successMessage: "Saved" },
      })
      .execute(undefined);

    expect(mockedToast.success).toHaveBeenCalledWith("Saved");
  });

  it("skips the global error toast when meta.skipGlobalErrorToast is set", async () => {
    const queryClient = getQueryClient();

    await queryClient
      .getMutationCache()
      .build(queryClient, {
        mutationFn: () => Promise.reject(new ApiError("Invalid credentials", 401)),
        meta: { skipGlobalErrorToast: true },
      })
      .execute(undefined)
      .catch(() => undefined);

    expect(mockedToast.error).not.toHaveBeenCalled();
  });
});
