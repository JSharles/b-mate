"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { ReferenceDraft } from "schemas";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Label } from "@/shared/components/ui/label";
import { useDiscardDraft, useRegenerateDraft } from "../hooks";

const MAX_ATTEMPTS = 3;

// specs/015 FR-015. Refusing a draft is not a dead end: either the draft goes
// away and the previously validated version stays live, or it comes back
// corrected. The contributor writes an instruction, never the text itself —
// they direct, they do not draft.
export function RegenerateDraftDialog({
  projectId,
  draft,
  onOpenChange,
}: {
  projectId: string;
  draft: ReferenceDraft | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Projects.RegenerateDraftDialog");
  const [instruction, setInstruction] = useState("");
  const regenerate = useRegenerateDraft(projectId);
  const discard = useDiscardDraft(projectId);

  // research.md Decision 4: past three attempts the loop is not converging.
  // Saying so before the click is better than a 409 after it.
  const capReached = (draft?.attempt ?? 0) >= MAX_ATTEMPTS;
  const pending = regenerate.isPending || discard.isPending;

  function close() {
    setInstruction("");
    onOpenChange(false);
  }

  function handleRegenerate(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || !instruction.trim()) return;
    regenerate.mutate(
      { categoryKey: draft.categoryKey, instruction: instruction.trim() },
      { onSuccess: close },
    );
  }

  function handleDiscard() {
    if (!draft) return;
    discard.mutate({ categoryKey: draft.categoryKey }, { onSuccess: close });
  }

  return (
    <Dialog
      open={draft !== null}
      onOpenChange={(open) => (open ? onOpenChange(true) : close())}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {capReached ? (
          <p className="text-sm text-muted-foreground">{t("capReached")}</p>
        ) : (
          <form onSubmit={handleRegenerate} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="draft-instruction">{t("instructionLabel")}</Label>
              <textarea
                id="draft-instruction"
                rows={4}
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                placeholder={t("instructionPlaceholder")}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>
            <Button type="submit" disabled={!instruction.trim() || pending}>
              {regenerate.isPending ? t("regeneratePending") : t("regenerate")}
            </Button>
          </form>
        )}

        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={handleDiscard}
        >
          {t("discard")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
