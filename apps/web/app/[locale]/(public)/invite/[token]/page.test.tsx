import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useInvitationDetails } from "@/features/invitations/hooks";
import InvitePage from "./page";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, use: (value: unknown) => value };
});

vi.mock("@/features/invitations/hooks", () => ({
  useInvitationDetails: vi.fn(),
}));

vi.mock("@/features/invitations/components/accept-invitation-form", () => ({
  AcceptInvitationForm: ({
    token,
    email,
    accountExists,
  }: {
    token: string;
    email: string;
    accountExists: boolean;
  }) => (
    <div>
      accept-invitation-form:{token}:{email}:{String(accountExists)}
    </div>
  ),
}));

const mockedUseInvitationDetails = vi.mocked(useInvitationDetails);

function renderPage() {
  return render(
    <InvitePage params={{ token: "the-token" } as unknown as Promise<{ token: string }>} />,
  );
}

describe("InvitePage", () => {
  it("shows the accept invitation form for a valid, pending invitation", () => {
    mockedUseInvitationDetails.mockReturnValue({
      data: {
        email: "client@example.com",
        projectTitle: "Site vitrine client X",
        accountExists: false,
        status: "invited",
      },
      isPending: false,
    } as unknown as ReturnType<typeof useInvitationDetails>);

    renderPage();

    expect(screen.getByText("Site vitrine client X")).toBeInTheDocument();
    expect(
      screen.getByText("accept-invitation-form:the-token:client@example.com:false"),
    ).toBeInTheDocument();
  });

  it("shows an invalid-link message for an unknown token", () => {
    mockedUseInvitationDetails.mockReturnValue({
      data: null,
      isPending: false,
    } as unknown as ReturnType<typeof useInvitationDetails>);

    renderPage();

    expect(screen.getByText("invalidLink")).toBeInTheDocument();
  });

  it("shows a no-longer-available message for an expired invitation", () => {
    mockedUseInvitationDetails.mockReturnValue({
      data: {
        email: "client@example.com",
        projectTitle: "Site vitrine client X",
        accountExists: false,
        status: "expired",
      },
      isPending: false,
    } as unknown as ReturnType<typeof useInvitationDetails>);

    renderPage();

    expect(screen.getByText("noLongerAvailable")).toBeInTheDocument();
  });

  it("shows the same no-longer-available message for a cancelled invitation (FR-013)", () => {
    mockedUseInvitationDetails.mockReturnValue({
      data: {
        email: "client@example.com",
        projectTitle: "Site vitrine client X",
        accountExists: false,
        status: "cancelled",
      },
      isPending: false,
    } as unknown as ReturnType<typeof useInvitationDetails>);

    renderPage();

    expect(screen.getByText("noLongerAvailable")).toBeInTheDocument();
  });

  it("shows an already-accepted message", () => {
    mockedUseInvitationDetails.mockReturnValue({
      data: {
        email: "client@example.com",
        projectTitle: "Site vitrine client X",
        accountExists: false,
        status: "accepted",
      },
      isPending: false,
    } as unknown as ReturnType<typeof useInvitationDetails>);

    renderPage();

    expect(screen.getByText("alreadyAccepted")).toBeInTheDocument();
  });
});
