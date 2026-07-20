import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import type { User } from "schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLogout } from "@/features/auth/hooks";
import { SidebarProvider } from "@/shared/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";

vi.mock("@/features/auth/hooks", () => ({
  useLogout: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const mockedUseLogout = vi.mocked(useLogout);

const fakeUser = {
  id: "1",
  firstName: "Jean",
  lastName: "Charles",
  email: "jc@example.com",
} as User;

describe("AppSidebar", () => {
  beforeEach(() => {
    mockedUseLogout.mockReturnValue({ mutate: vi.fn() } as unknown as ReturnType<
      typeof useLogout
    >);
  });

  it("shows the user's initials and full name", () => {
    render(
      <SidebarProvider>
        <AppSidebar user={fakeUser} />
      </SidebarProvider>,
    );

    expect(screen.getByText("JC")).toBeInTheDocument();
    expect(screen.getByText("Jean Charles")).toBeInTheDocument();
  });

  it("calls logout.mutate when logout is selected", async () => {
    const mutate = vi.fn();
    mockedUseLogout.mockReturnValue({ mutate } as unknown as ReturnType<typeof useLogout>);
    const user = userEvent.setup();

    render(
      <SidebarProvider>
        <AppSidebar user={fakeUser} />
      </SidebarProvider>,
    );

    await user.click(screen.getByText("Jean Charles"));
    await user.click(await screen.findByText("logout"));

    expect(mutate).toHaveBeenCalled();
  });
});
