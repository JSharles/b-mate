import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InviteClientDialog } from "./invite-client-dialog";

vi.mock("./invite-client-form", () => ({
  InviteClientForm: ({ projectId }: { projectId: string }) => (
    <div>invite-client-form:{projectId}</div>
  ),
}));

vi.mock("./invitations-list", () => ({
  InvitationsList: ({ projectId }: { projectId: string }) => (
    <div>invitations-list:{projectId}</div>
  ),
}));

describe("InviteClientDialog", () => {
  it("renders the invite form and invitations list when open", () => {
    render(
      <InviteClientDialog projectId="project-1" open={true} onOpenChange={() => {}} />,
    );

    expect(screen.getByText("inviteClient")).toBeInTheDocument();
    expect(screen.getByText("invite-client-form:project-1")).toBeInTheDocument();
    expect(screen.getByText("invitations-list:project-1")).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    render(
      <InviteClientDialog projectId="project-1" open={false} onOpenChange={() => {}} />,
    );

    expect(screen.queryByText("invite-client-form:project-1")).not.toBeInTheDocument();
  });
});
