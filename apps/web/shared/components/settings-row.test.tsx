import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SettingsRow } from "./settings-row";

describe("SettingsRow", () => {
  it("shows the title, description, and control content", () => {
    render(
      <SettingsRow title="Board" description="Not connected yet">
        <button type="button">Connect</button>
      </SettingsRow>,
    );

    expect(screen.getByText("Board")).toBeInTheDocument();
    expect(screen.getByText("Not connected yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
  });

  it("renders no description wrapper when none is given", () => {
    render(
      <SettingsRow title="Board">
        <button type="button">Connect</button>
      </SettingsRow>,
    );

    expect(screen.getByText("Board")).toBeInTheDocument();
    expect(screen.getByText("Board").parentElement?.children).toHaveLength(1);
  });
});
