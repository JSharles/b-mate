import { render, screen } from "@testing-library/react";
import { BookOpen } from "lucide-react";
import { describe, expect, it } from "vitest";
import { ComingSoonCard } from "./coming-soon-card";

describe("ComingSoonCard", () => {
  it("renders the title and message it's given", () => {
    render(<ComingSoonCard icon={BookOpen} title="Documentation" message="Coming soon" />);

    expect(screen.getByText("Documentation")).toBeInTheDocument();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Documentation" })).toBeInTheDocument();
  });

  it("renders a compact square tile with just the icon and title, no message", () => {
    render(<ComingSoonCard icon={BookOpen} title="Documentation" compact />);

    expect(screen.getByRole("heading", { level: 2, name: "Documentation" })).toBeInTheDocument();
    expect(screen.queryByText("Coming soon")).not.toBeInTheDocument();
  });
});
