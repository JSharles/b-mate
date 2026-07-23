"use client";

import { BookOpen, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { use } from "react";
import { InvitationsCard } from "@/features/invitations/components/invitations-card";
import { ProjectMembersList } from "@/features/projects/components/project-members-list";
import { useProject } from "@/features/projects/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: project, isPending } = useProject(id);
  const t = useTranslations("Projects.ProjectPage");

  if (isPending) {
    return <Skeleton className="h-8 w-64" />;
  }

  if (!project) {
    return null;
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <h1 className="text-2xl font-semibold">{project.title}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            {t("members")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ProjectMembersList projectId={id} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <InvitationsCard projectId={id} />

        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              {t("settings")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
            <Settings2 className="size-4 shrink-0" />
            {t("settingsComingSoon")}
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              {t("documentation")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
            <BookOpen className="size-4 shrink-0" />
            {t("documentationComingSoon")}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
