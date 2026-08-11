import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import {
  useCanonicalSource,
  useConfirmWorkingLanguage,
  useProposeWorkingLanguage,
  useSourceItemProvenance,
} from "../hooks";
import { CanonicalSourceView } from "./canonical-source-view";

vi.mock("../hooks", () => ({
  useCanonicalSource: vi.fn(),
  useSourceItemProvenance: vi.fn(),
  useProposeWorkingLanguage: vi.fn(),
  useConfirmWorkingLanguage: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("./guided-correction-dialog", () => ({
  GuidedCorrectionDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">guided-correction-dialog</div> : null,
}));

vi.mock("./clarifications-panel", () => ({
  ClarificationsPanel: () => <div>clarifications-panel</div>,
}));

const source = {
  revision: {
    id: "revision-4",
    sequence: 4,
    trigger: "document_added",
    summary: "Ajout du cahier des charges",
    impactedCategories: ["specifications"],
    createdAt: "2026-08-11T09:00:00.000Z",
  },
  workingLanguage: "fr",
  items: [
    {
      id: "item-1",
      kind: "decision",
      state: "confirmed",
      content: "Le lancement public est prévu le 19 septembre.",
      categories: ["specifications"],
      provenanceCount: 2,
      clarificationIds: [],
    },
  ],
  total: 1,
  nextCursor: null,
};

function idleMutation() {
  return {
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  };
}

describe("CanonicalSourceView", () => {
  beforeEach(() => {
    vi.mocked(useCanonicalSource).mockReturnValue({
      data: source,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useCanonicalSource>);
    vi.mocked(useSourceItemProvenance).mockReturnValue({
      data: {
        itemId: "item-1",
        revisionId: "revision-4",
        origins: [
          {
            kind: "document",
            documentId: "document-1",
            label: "Cahier des charges.pdf",
            locator: { type: "pdf_page", page: 3, excerpt: "Lancement le 19 septembre" },
            excerpt: "Le lancement public aura lieu le 19 septembre.",
            role: "supports",
          },
        ],
        history: [
          {
            revisionId: "revision-4",
            revisionSequence: 4,
            change: "updated",
            createdAt: "2026-08-11T09:00:00.000Z",
          },
        ],
      },
      isPending: false,
    } as unknown as ReturnType<typeof useSourceItemProvenance>);
    vi.mocked(useProposeWorkingLanguage).mockReturnValue(
      idleMutation() as unknown as ReturnType<typeof useProposeWorkingLanguage>,
    );
    vi.mocked(useConfirmWorkingLanguage).mockReturnValue(
      idleMutation() as unknown as ReturnType<typeof useConfirmWorkingLanguage>,
    );
  });

  it("presents one readable source without offering to navigate to itself", () => {
    render(<CanonicalSourceView projectId="project-1" />);

    expect(screen.getByText("Le lancement public est prévu le 19 septembre.")).toBeVisible();
    // This view is only ever rendered by the document-management page, so a
    // link to that page navigated to the page the user was already on.
    expect(
      screen.queryByRole("link", { name: "manageDocuments" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("revision", { exact: false })).toBeVisible();
  });

  it("expands an item's origins and revision history", async () => {
    const user = userEvent.setup();
    render(<CanonicalSourceView projectId="project-1" />);

    await user.click(screen.getByRole("button", { name: "showProvenance" }));

    expect(screen.getByText("Le lancement public aura lieu le 19 septembre.")).toBeVisible();
    expect(screen.getByText("historyTitle")).toBeVisible();
    expect(screen.getByText("revisionLabel", { exact: false })).toBeVisible();
  });

  it("opens the guided correction for the selected item", async () => {
    const user = userEvent.setup();
    render(<CanonicalSourceView projectId="project-1" />);

    await user.click(screen.getByRole("button", { name: "correctItem" }));

    expect(screen.getByText("guided-correction-dialog")).toBeVisible();
  });

  it("shows a language impact preview and requires confirmation", async () => {
    const propose = idleMutation();
    const confirm = idleMutation();
    propose.mutate.mockImplementation(
      (_data, options: { onSuccess: (value: unknown) => void }) =>
        options.onSuccess({
          id: "proposal-1",
          fromLanguage: "fr",
          toLanguage: "en",
          expectedSourceRevisionId: "revision-4",
          impactedItemCount: 1,
          version: 1,
        }),
    );
    vi.mocked(useProposeWorkingLanguage).mockReturnValue(
      propose as unknown as ReturnType<typeof useProposeWorkingLanguage>,
    );
    vi.mocked(useConfirmWorkingLanguage).mockReturnValue(
      confirm as unknown as ReturnType<typeof useConfirmWorkingLanguage>,
    );
    const user = userEvent.setup();
    render(<CanonicalSourceView projectId="project-1" />);

    await user.click(screen.getByRole("button", { name: "Source.changeLanguage" }));
    await user.click(screen.getByRole("button", { name: "Source.english" }));

    expect(screen.getByText("Source.languagePreviewDescription", { exact: false })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Source.confirmLanguage" }));
    expect(confirm.mutate).toHaveBeenCalledWith(
      "proposal-1",
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
