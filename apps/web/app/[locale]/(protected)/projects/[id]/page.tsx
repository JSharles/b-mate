"use client";

import { BookOpen, Cpu, FileText, ListTodo, Map, Search, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { use } from "react";
import { InvitationsCard } from "@/features/invitations/components/invitations-card";
import { ComingSoonCard } from "@/features/projects/components/coming-soon-card";
import { ProjectMembersList } from "@/features/projects/components/project-members-list";
import { useProject } from "@/features/projects/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
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
            {t("members")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ProjectMembersList projectId={id} canManageMembers={project.isAdmin} />
        </CardContent>
      </Card>

      {project.isAdmin && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <InvitationsCard projectId={id} />
        </div>
      )}

      {isContributor && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <ComingSoonCard icon={Settings2} title={t("settings")} message={t("settingsComingSoon")} />
          <ComingSoonCard
            icon={BookOpen}
            title={t("documentation")}
            message={t("documentationComingSoon")}
          />
        </div>
      )}

      {!isContributor && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <ComingSoonCard icon={FileText} title={t("overview")} message={t("overviewComingSoon")} />
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
          <ComingSoonCard
            icon={ListTodo}
            title={t("currentTask")}
            message={t("currentTaskComingSoon")}
          />
        </div>
      )}
    </div>
  );
}
