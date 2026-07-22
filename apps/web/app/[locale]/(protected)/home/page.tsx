"use client";

import { useTranslations } from "next-intl";
import { ProjectList } from "@/features/projects/components/project-list";
import { useCurrentUser } from "@/shared/hooks/use-current-user";
import { Skeleton } from "@/shared/components/ui/skeleton";

export default function HomePage() {
  const { data: user, isPending } = useCurrentUser();
  const t = useTranslations("Home");

  return (
    <div className="flex flex-col gap-8">
      {isPending || !user ? (
        <Skeleton className="h-9 w-64" />
      ) : (
        <h1 className="text-3xl font-semibold">{t("welcome", { firstName: user.firstName })}</h1>
      )}
      <ProjectList />
    </div>
  );
}
