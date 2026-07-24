"use client";

import { BookOpen, Cpu, FileText, Map, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { use } from "react";
import { BoardConnectionCard } from "@/features/board-connections/components/board-connection-card";
import { CurrentTaskCard } from "@/features/current-task/components/current-task-card";
import { InviteButton } from "@/features/invitations/components/invite-button";
import { InvitationsList } from "@/features/invitations/components/invitations-list";
import { ComingSoonCard } from "@/features/projects/components/coming-soon-card";
import { ProjectMembersList } from "@/features/projects/components/project-members-list";
import { useProject } from "@/features/projects/hooks";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: project, isPending, isError } = useProject(id);
  const t = useTranslations("Projects.ProjectPage");

  if (isPending) {
    return <Skeleton className="h-8 w-64" />;
  }

  // A failed refetch keeps the previous `data` around by default (React
  // Query) — without this check, a stale project from a prior session in
  // this tab (e.g. after logout/login as someone else) would keep rendering,
  // including admin-only cartouches, even once the fresh fetch is rejected.
  if (isError || !project) {
    return null;
  }

  const isContributor = project.role === "contributor";

  return (
    <div className="flex w-full flex-col gap-6">
      <h1 className="text-2xl font-semibold">{project.title}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            {t("team")}
          </CardTitle>
          {project.isAdmin && (
            <CardAction>
              <InviteButton projectId={id} />
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t("active")}
            </h3>
            <ProjectMembersList projectId={id} canManageMembers={project.isAdmin} />
          </div>

          {project.isAdmin && (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t("pending")}
              </h3>
              <InvitationsList projectId={id} />
            </div>
          )}
        </CardContent>
      </Card>

      {isContributor && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <BoardConnectionCard projectId={id} />
          <ComingSoonCard
            icon={BookOpen}
            title={t("documentation")}
            message={t("documentationComingSoon")}
          />
        </div>
      )}

      {!isContributor && (
        <>
          {/* The one real, live cartouche gets its own row rather than
              competing for row-height with placeholder cards, and appears
              first — it's the actual reason a client opens this page. */}
          <CurrentTaskCard projectId={id} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <ComingSoonCard
              icon={FileText}
              title={t("overview")}
              message={t("overviewComingSoon")}
            />
            <ComingSoonCard
              icon={Search}
              title={t("discoveryAudit")}
              message={t("discoveryAuditComingSoon")}
            />
            <ComingSoonCard
              icon={Cpu}
              title={t("technicalDecisions")}
              message={t("technicalDecisionsComingSoon")}
            />
            <ComingSoonCard icon={Map} title={t("roadmap")} message={t("roadmapComingSoon")} />
            <ComingSoonCard
              icon={BookOpen}
              title={t("clientDocumentation")}
              message={t("clientDocumentationComingSoon")}
            />
          </div>
        </>
      )}
    </div>
  );
}
