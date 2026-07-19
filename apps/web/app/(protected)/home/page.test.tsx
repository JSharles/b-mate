import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("HomePage", () => {
  it("renders without crashing", () => {
    const { container } = render(<HomePage />);
    expect(container.firstChild).toBeInstanceOf(HTMLDivElement);
  });
});
