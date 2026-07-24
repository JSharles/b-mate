import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InviteButton } from "./invite-button";

vi.mock("./invite-client-dialog", () => ({
  InviteClientDialog: vi.fn(({ open }: { open: boolean }) => (
    <div data-testid="invite-client-dialog">{open ? "open" : "closed"}</div>
  )),
}));

describe("InviteButton", () => {
  it("opens the invite dialog when clicked", async () => {
    const user = userEvent.setup();

    render(<InviteButton projectId="project-1" />);
    expect(screen.getByTestId("invite-client-dialog")).toHaveTextContent("closed");

    await user.click(screen.getByRole("button", { name: "invite" }));

    expect(screen.getByTestId("invite-client-dialog")).toHaveTextContent("open");
  });
});
