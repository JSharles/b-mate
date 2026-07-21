"use client";

import { useTranslations } from "next-intl";
import { use } from "react";
import { InviteClientForm } from "@/features/invitations/components/invite-client-form";
import { InvitationsList } from "@/features/invitations/components/invitations-list";
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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <h1 className="text-2xl font-semibold">{project.title}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            {t("inviteClient")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <InviteClientForm projectId={id} />
          <InvitationsList projectId={id} />
        </CardContent>
      </Card>
    </div>
  );
}
