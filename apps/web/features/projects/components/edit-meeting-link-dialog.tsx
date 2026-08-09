"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { ApiError } from "@/shared/lib/api-client";
import { useUpdateProject } from "../hooks";

interface EditMeetingLinkDialogProps {
  projectId: string;
  currentUrl: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function errorMessage(error: unknown, generic: string): string {
  return error instanceof ApiError ? error.message : generic;
}

export function EditMeetingLinkDialog({
  projectId,
  currentUrl,
  open,
  onOpenChange,
}: EditMeetingLinkDialogProps) {
  const t = useTranslations("Projects.EditMeetingLinkDialog");
  const tToasts = useTranslations("Toasts");
  const [url, setUrl] = useState(currentUrl ?? "");
  const update = useUpdateProject(projectId);

  // The trigger (MeetingLinkCard's Edit button) flips `open` directly, so
  // it never goes through Radix's own onOpenChange — this re-seeds the
  // field from the latest saved value on the open transition without an
  // effect (React's "adjusting state when a prop changes" pattern: setState
  // during render is safe here, React re-renders immediately before commit
  // instead of triggering the extra render/paint an effect would cause).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setUrl(currentUrl ?? "");
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) update.reset();
    onOpenChange(nextOpen);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = url.trim();
    // An empty field is a valid submission — it clears the link rather
    // than being blocked, since removing it is as legitimate as setting it.
    update.mutate(
      { meetingUrl: trimmed === "" ? null : trimmed },
      { onSuccess: () => handleOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="project-meeting-url">{t("urlLabel")}</Label>
            <Input
              id="project-meeting-url"
              type="url"
              placeholder="https://meet.google.com/…"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? t("savePending") : t("save")}
          </Button>
          {update.isError && (
            <p className="text-sm text-destructive">
              {errorMessage(update.error, tToasts("genericError"))}
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
