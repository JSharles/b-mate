import { render, screen } from "@testing-library/react";
import { useSearchParams } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubAuthCard } from "./github-auth-card";

vi.mock("next/navigation", () => ({
  useSearchParams: vi.fn(),
}));

const mockedUseSearchParams = vi.mocked(useSearchParams);

function paramsWith(error: string | null) {
  return {
    get: (key: string) => (key === "error" ? error : null),
  } as unknown as ReturnType<typeof useSearchParams>;
}

describe("GitHubAuthCard", () => {
  beforeEach(() => {
    mockedUseSearchParams.mockReturnValue(paramsWith(null));
  });

  it("links to the API's GitHub OAuth entry point with the current locale", () => {
    render(<GitHubAuthCard />);

    expect(screen.getByRole("link", { name: "continue" })).toHaveAttribute(
      "href",
      "http://localhost:3001/auth/github?locale=fr",
    );
  });

  it("shows no error message when the URL has none", () => {
    render(<GitHubAuthCard />);

    expect(screen.queryByText("errorEmailRequired")).not.toBeInTheDocument();
    expect(screen.queryByText("errorGeneric")).not.toBeInTheDocument();
  });

  it("shows the missing-verified-email message for github_email_required", () => {
    mockedUseSearchParams.mockReturnValue(paramsWith("github_email_required"));

    render(<GitHubAuthCard />);

    expect(screen.getByText("errorEmailRequired")).toBeInTheDocument();
  });

  it("shows a generic message for state_mismatch", () => {
    mockedUseSearchParams.mockReturnValue(paramsWith("state_mismatch"));

    render(<GitHubAuthCard />);

    expect(screen.getByText("errorGeneric")).toBeInTheDocument();
  });

  it("shows a generic message for github_auth_failed", () => {
    mockedUseSearchParams.mockReturnValue(paramsWith("github_auth_failed"));

    render(<GitHubAuthCard />);

    expect(screen.getByText("errorGeneric")).toBeInTheDocument();
  });
});
