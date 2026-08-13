"use client";

import { useTranslations } from "next-intl";
import type { SectionView } from "schemas";
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
import { useArchiveSection } from "../hooks";

// Deleting a section takes a heading away from someone who is reading it, and
// the contributor is the only one who will ever see the warning. Removing a
// document already asks before it acts; this asks for the same reason, and
// names the consequence rather than the action.
export function DeleteSectionDialog({
  projectId,
  section,
  open,
  onOpenChange,
}: {
  projectId: string;
  section: SectionView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Projects.Documentation.Sections.Delete");
  const archive = useArchiveSection(projectId);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title", { name: section.name })}</AlertDialogTitle>
          <AlertDialogDescription>
            {section.hasPublishedContent
              ? t("publishedConsequence")
              : t("unpublishedConsequence")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {archive.isError && (
          <p role="alert" className="text-sm text-destructive">
            {t("error")}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-foreground hover:bg-destructive/90"
            disabled={archive.isPending}
            onClick={(event) => {
              event.preventDefault();
              archive.mutate(section.id, {
                onSuccess: () => onOpenChange(false),
              });
            }}
          >
            {archive.isPending ? t("deleting") : t("confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
