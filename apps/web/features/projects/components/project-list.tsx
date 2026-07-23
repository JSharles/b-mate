"use client";

import { FolderKanban } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import type { Project } from "schemas";
import { Link } from "@/i18n/navigation";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useCurrentUser } from "@/shared/hooks/use-current-user";
import { CreateProjectDialog } from "./create-project-dialog";
import { useProjects } from "../hooks";

function CreatedAt({ createdAt }: { createdAt: string }) {
  const locale = useLocale();
  const t = useTranslations("Home");
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return (
    <p className="text-sm text-muted-foreground">
      {t("createdAt", { date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date) })}
    </p>
  );
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <Link key={project.id} href={`/projects/${project.id}`}>
      <Card className="h-full gap-4 transition-all hover:-translate-y-0.5 hover:shadow-md">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-accent">
              <FolderKanban className="size-5 text-foreground" strokeWidth={1.75} />
            </div>
            {project.status ? (
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {project.status}
              </span>
            ) : null}
          </div>
          <CardTitle className="text-lg">{project.title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {project.createdAt ? <CreatedAt createdAt={project.createdAt} /> : null}
          {project.progressPercentage != null ? (
            <div className="flex flex-col gap-1.5">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-foreground"
                  style={{ width: `${project.progressPercentage}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground">{project.progressPercentage}%</span>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  );
}

export function ProjectList() {
  const { data: projects, isPending } = useProjects();
  const { data: currentUser } = useCurrentUser();
  const [createOpen, setCreateOpen] = useState(false);
  const t = useTranslations("Home");
  const canCreateProject = currentUser?.accountKind === "developer";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">{t("title")}</h2>
        {canCreateProject ? (
          <Button onClick={() => setCreateOpen(true)}>{t("newProject")}</Button>
        ) : null}
      </div>

      {isPending ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : !projects || projects.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <FolderKanban className="size-8 text-muted-foreground" strokeWidth={1.5} />
          <p className="font-medium">{t("emptyTitle")}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{t("emptyDescription")}</p>
          {canCreateProject ? (
            <Button className="mt-2" onClick={() => setCreateOpen(true)}>
              {t("emptyCta")}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}

      {canCreateProject ? (
        <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
      ) : null}
    </div>
  );
}
