"use client";

import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { use } from "react";
import { InviteButton } from "@/features/invitations/components/invite-button";
import { InvitationsList } from "@/features/invitations/components/invitations-list";
import { ProjectMembersList } from "@/features/projects/components/project-members-list";
import { useProject } from "@/features/projects/hooks";
import { Link } from "@/i18n/navigation";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";

// Unlike Settings (contributor-only), the team roster is visible to both
// roles — a client could already see it inline on the project page before
// this moved to its own route. Only the management actions below stay
// gated on `isAdmin`, exactly as they were on the old inline card.
export default function ProjectTeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: project, isPending, isError, refetch } = useProject(id);
  const t = useTranslations("Projects.TeamPage");

  if (isPending) {
    return <Skeleton className="h-8 w-64" />;
  }

  if (isError || !project) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <TriangleAlert className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t("loadErrorTitle")}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
          {t("loadErrorRetry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href={`/projects/${id}`}
          className="w-fit text-sm text-muted-foreground hover:underline"
        >
          {t("backToProject")}
        </Link>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          {project.isAdmin && <InviteButton projectId={id} />}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t("active")}
        </h2>
        <ProjectMembersList projectId={id} canManageMembers={project.isAdmin} />
      </div>

      {project.isAdmin && (
        <div className="flex flex-col gap-2">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t("pending")}
          </h2>
          <InvitationsList projectId={id} />
        </div>
      )}
    </div>
  );
}
