"use client";

import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { InvitationsList } from "./invitations-list";
import { InviteClientForm } from "./invite-client-form";

interface InviteClientDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteClientDialog({ projectId, open, onOpenChange }: InviteClientDialogProps) {
  const t = useTranslations("Projects.ProjectPage");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("inviteClient")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <InviteClientForm projectId={projectId} />
          <InvitationsList projectId={projectId} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
