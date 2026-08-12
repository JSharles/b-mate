"use client";

import { AlertTriangle, LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { Button } from "@/shared/components/ui/button";
import { useConfirmDocumentRemoval, useDocumentRemovalPreview } from "../hooks";

interface RemoveDocumentDialogProps {
  projectId: string;
  documentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemoved?: () => void;
}

export function RemoveDocumentDialog({
  projectId,
  documentId,
  open,
  onOpenChange,
  onRemoved,
}: RemoveDocumentDialogProps) {
  const t = useTranslations("Projects.DocumentationNew.Removal");
  const preview = useDocumentRemovalPreview(
    projectId,
    open ? documentId : null,
  );
  const confirm = useConfirmDocumentRemoval(projectId);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) confirm.reset();
    onOpenChange(nextOpen);
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-destructive" />
            {t("title")}
          </AlertDialogTitle>
          <AlertDialogDescription>{t("description")}</AlertDialogDescription>
        </AlertDialogHeader>

        {preview.isPending && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
            {t("loadingImpact")}
          </div>
        )}

        {preview.data && (
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
            <p>
              {preview.data.sourceRevisionId === null
                ? t("notIncorporatedImpact")
                : t("impact", {
                    items: preview.data.supportedItemCount,
                    sole: preview.data.soleSupportItemCount,
                  })}
            </p>
            <p className="mt-2 text-muted-foreground">{t("clientSafety")}</p>
          </div>
        )}

        {(preview.isError || confirm.isError) && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p role="alert" className="text-sm text-destructive">
              {t("error")}
            </p>
            {preview.isError && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => preview.refetch()}
              >
                {t("retryPreview")}
              </Button>
            )}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>{t(confirm.isError ? "close" : "cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-foreground hover:bg-destructive/90"
            disabled={!preview.data || confirm.isPending}
            onClick={(event) => {
              event.preventDefault();
              if (!preview.data || !documentId) return;
              confirm.mutate(
                {
                  documentId,
                  data: {
                    expectedDocumentVersion: preview.data.documentVersion,
                    expectedSourceRevisionId: preview.data.sourceRevisionId,
                    confirmationToken: preview.data.confirmationToken,
                    confirmed: true,
                  },
                },
                {
                  onSuccess: (result) => {
                    handleOpenChange(false);
                    if (result.status === "completed") onRemoved?.();
                  },
                },
              );
            }}
          >
            {confirm.isPending && (
              <LoaderCircle className="animate-spin motion-reduce:animate-none" />
            )}
            {confirm.isPending
              ? t("removing")
              : confirm.isError
                ? t("retryConfirm")
                : t("confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
