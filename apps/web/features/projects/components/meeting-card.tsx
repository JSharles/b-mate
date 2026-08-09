"use client";

import { Video } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useProject } from "../hooks";
import { ComingSoonCard } from "./coming-soon-card";

// The client-facing counterpart to MeetingLinkCard (which is the
// developer's edit surface). Read-only: a client just needs a fast way to
// join, not to set/change the link. Falls back to the existing
// ComingSoonCard placeholder once no link has been set yet — same visual
// language the client sidebar already uses for not-yet-real content.
export function MeetingCard({ projectId }: { projectId: string }) {
  const { data: project, isPending } = useProject(projectId);
  const t = useTranslations("Projects.MeetingCard");

  if (isPending) {
    return <Skeleton className="h-24 w-full rounded-xl" />;
  }

  if (!project?.meetingUrl) {
    return <ComingSoonCard icon={Video} title={t("title")} message={t("hint")} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            {t("title")}
          </h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Button asChild className="w-full">
          <a href={project.meetingUrl} target="_blank" rel="noreferrer">
            <Video className="size-4" />
            {t("join")}
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
