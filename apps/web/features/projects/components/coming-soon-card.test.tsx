import { render, screen } from "@testing-library/react";
import { BookOpen } from "lucide-react";
import { describe, expect, it } from "vitest";
import { ComingSoonCard } from "./coming-soon-card";

describe("ComingSoonCard", () => {
  it("renders the title and message it's given", () => {
    render(<ComingSoonCard icon={BookOpen} title="Documentation" message="Coming soon" />);

    expect(screen.getByText("Documentation")).toBeInTheDocument();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
  });
});
