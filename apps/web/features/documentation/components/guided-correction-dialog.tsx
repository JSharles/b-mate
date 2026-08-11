"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Label } from "@/shared/components/ui/label";
import { ApiError } from "@/shared/lib/api-client";
import { useSourceItemCorrection } from "../hooks";

interface GuidedCorrectionDialogProps {
  projectId: string;
  itemId: string;
  currentContent: string;
  revisionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GuidedCorrectionDialog({
  projectId,
  itemId,
  currentContent,
  revisionId,
  open,
  onOpenChange,
}: GuidedCorrectionDialogProps) {
  const t = useTranslations("Projects.Documentation.Correction");
  const tToasts = useTranslations("Toasts");
  const correction = useSourceItemCorrection(projectId, itemId);
  const [content, setContent] = useState(currentContent);
  const [reason, setReason] = useState("");

  const error = correction.error;
  const errorText =
    error instanceof ApiError && error.status === 409
      ? t("staleError")
      : error instanceof ApiError
        ? error.message
        : tToasts("genericError");

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setContent(currentContent);
          setReason("");
          correction.reset();
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmedReason = reason.trim();
            correction.mutate(
              {
                expectedSourceRevisionId: revisionId,
                correctedContent: content.trim(),
                ...(trimmedReason ? { reason: trimmedReason } : {}),
              },
              { onSuccess: () => onOpenChange(false) },
            );
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={`correction-${itemId}`}>{t("correctedContentLabel")}</Label>
            <textarea
              id={`correction-${itemId}`}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={5}
              className="w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            <p className="text-xs leading-relaxed text-muted-foreground">{t("contentHint")}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`correction-reason-${itemId}`}>{t("reasonLabel")}</Label>
            <textarea
              id={`correction-reason-${itemId}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              className="w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>
          {correction.isError && (
            <p role="alert" className="text-sm text-destructive">{errorText}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={!content.trim() || content.trim() === currentContent.trim() || correction.isPending}
            >
              {correction.isPending ? t("submitting") : t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
