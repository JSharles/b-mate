"use client";

import { ExternalLink, Video } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { SettingsRow } from "@/shared/components/settings-row";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useProject } from "../hooks";
import { EditMeetingLinkDialog } from "./edit-meeting-link-dialog";

// Not yet consumed anywhere client-facing (see docs/PRODUCT.md "Working
// notes") — this row just gives a contributor somewhere real to put the
// link today, so it isn't lost, and it survives a page reload.
export function MeetingLinkCard({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const { data: project, isPending } = useProject(projectId);
  const t = useTranslations("Projects.MeetingLinkCard");

  return (
    <>
      <SettingsRow
        title={t("title")}
        description={
          isPending ? (
            <Skeleton className="h-4 w-32" />
          ) : project?.meetingUrl ? (
            <a
              href={project.meetingUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 hover:text-foreground hover:underline"
            >
              {t("viewLink")}
              <ExternalLink className="size-3.5 shrink-0" />
            </a>
          ) : (
            <span className="flex items-center gap-1.5">
              <Video className="size-3.5 shrink-0" />
              {t("notSet")}
            </span>
          )
        }
      >
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          {t("edit")}
        </Button>
      </SettingsRow>

      <EditMeetingLinkDialog
        projectId={projectId}
        currentUrl={project?.meetingUrl ?? null}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
