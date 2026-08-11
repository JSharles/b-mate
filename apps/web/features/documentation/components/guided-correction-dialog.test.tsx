import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useSourceItemCorrection } from "../hooks";
import { GuidedCorrectionDialog } from "./guided-correction-dialog";

vi.mock("../hooks", () => ({ useSourceItemCorrection: vi.fn() }));

const mockedCorrection = vi.mocked(useSourceItemCorrection);

describe("GuidedCorrectionDialog", () => {
  it("records an attributable factual correction against the displayed revision", async () => {
    const mutate = vi.fn();
    mockedCorrection.mockReturnValue({
      mutate,
      reset: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useSourceItemCorrection>);
    const user = userEvent.setup();

    render(
      <GuidedCorrectionDialog
        projectId="project-1"
        itemId="item-1"
        currentContent="La livraison est prévue le 12 septembre."
        revisionId="revision-4"
        open
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue("La livraison est prévue le 12 septembre.")).toBeVisible();

    await user.clear(screen.getByLabelText("correctedContentLabel"));
    await user.type(
      screen.getByLabelText("correctedContentLabel"),
      "La livraison est prévue le 19 septembre.",
    );
    await user.type(screen.getByLabelText("reasonLabel"), "Date confirmée par le client");
    await user.click(screen.getByRole("button", { name: "submit" }));

    expect(mutate).toHaveBeenCalledWith(
      {
        expectedSourceRevisionId: "revision-4",
        correctedContent: "La livraison est prévue le 19 septembre.",
        reason: "Date confirmée par le client",
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
