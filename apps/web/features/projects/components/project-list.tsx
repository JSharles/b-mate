"use client";

import { FolderKanban } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/shared/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useProjects } from "../hooks";

export function ProjectList() {
  const { data: projects, isPending } = useProjects();
  const t = useTranslations("Home");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <Button asChild>
          <Link href="/projects/new">{t("newProject")}</Link>
        </Button>
      </div>

      {isPending ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : !projects || projects.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <FolderKanban className="size-8 text-muted-foreground" strokeWidth={1.5} />
          <p className="font-medium">{t("emptyTitle")}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{t("emptyDescription")}</p>
          <Button asChild className="mt-2">
            <Link href="/projects/new">{t("emptyCta")}</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="transition-colors hover:bg-accent">
                <CardHeader>
                  <CardTitle>{project.title}</CardTitle>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
