"use client";

import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useProjectMembers, useRemoveMember } from "../hooks";

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

interface ProjectMembersListProps {
  projectId: string;
  canManageMembers: boolean;
}

export function ProjectMembersList({ projectId, canManageMembers }: ProjectMembersListProps) {
  const { data: members, isPending, isError } = useProjectMembers(projectId);
  const removeMember = useRemoveMember(projectId);
  const t = useTranslations("Projects.ProjectMembersList");

  if (isPending) {
    return <Skeleton className="h-16 w-full" />;
  }

  // A failed refetch keeps the previous `data` around by default (React
  // Query) — checking isError here stops stale members from a prior session
  // rendering as if the fetch had succeeded.
  if (isError || !members || members.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  const adminCount = members.filter((member) => member.isAdmin).length;

  return (
    <ul className="flex flex-col divide-y border-t">
      {members.map((member) => {
        const isLastAdmin = member.isAdmin && adminCount === 1;

        return (
          <li
            key={member.userId}
            className="flex items-center justify-between gap-3 py-2 text-sm"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Avatar className="size-6 shrink-0">
                {member.image && <AvatarImage src={member.image} alt="" />}
                <AvatarFallback className="text-xs">
                  {initials(member.firstName, member.lastName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-col">
                <span className="flex items-center gap-1.5">
                  <span className="truncate">
                    {member.firstName} {member.lastName}
                  </span>
                  {member.isAdmin && (
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      {t("admin")}
                    </span>
                  )}
                </span>
                <span className="truncate text-xs text-muted-foreground">{member.email}</span>
              </div>
            </div>
            {canManageMembers && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={removeMember.isPending || isLastAdmin}
                title={isLastAdmin ? t("lastAdminHint") : undefined}
                onClick={() => removeMember.mutate(member.userId)}
              >
                {removeMember.isPending && removeMember.variables === member.userId
                  ? t("removing")
                  : t("remove")}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
