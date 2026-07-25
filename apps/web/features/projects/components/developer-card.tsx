"use client";

import { Code2, Mail, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useProjectMembers } from "../hooks";

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

export function DeveloperCard({ projectId }: { projectId: string }) {
  const { data: members, isPending } = useProjectMembers(projectId);
  const t = useTranslations("Projects.DeveloperCard");

  // A project has, in practice, exactly one contributor today — the first
  // one found is shown as "the developer". Simplification to revisit if
  // projects ever gain more than one contributor (see docs/PRODUCT.md
  // Working notes).
  const developer = members?.find((member) => member.role === "contributor");

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            {t("title")}
          </h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col items-center justify-center gap-2 overflow-y-auto text-center">
        {isPending ? (
          <>
            <Skeleton className="size-14 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </>
        ) : !developer ? (
          <p className="py-6 text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <>
            <Avatar className="size-14">
              <AvatarImage src={developer.image ?? undefined} alt="" />
              <AvatarFallback className="text-lg font-semibold">
                {initials(developer.firstName, developer.lastName)}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <p className="text-base font-semibold">
                {developer.firstName} {developer.lastName}
              </p>
              <p className="text-xs text-muted-foreground">
                {developer.roleTitle ?? t("roleFallback")}
              </p>
            </div>
            <div className="flex w-full flex-col gap-1 border-t pt-2 text-xs">
              <span className="flex items-center justify-center gap-2 text-muted-foreground">
                <Mail className="size-3.5 shrink-0" />
                {developer.email}
              </span>
              {developer.phone && (
                <span className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Phone className="size-3.5 shrink-0" />
                  {developer.phone}
                </span>
              )}
              {developer.github && (
                <span className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Code2 className="size-3.5 shrink-0" />
                  {developer.github}
                </span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
