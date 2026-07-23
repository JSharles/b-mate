"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useProjectMembers, useRemoveMember } from "../hooks";

interface ProjectMembersListProps {
  projectId: string;
  canManageMembers: boolean;
}

export function ProjectMembersList({ projectId, canManageMembers }: ProjectMembersListProps) {
  const { data: members, isPending } = useProjectMembers(projectId);
  const removeMember = useRemoveMember(projectId);
  const t = useTranslations("Projects.ProjectMembersList");

  if (isPending) {
    return <Skeleton className="h-16 w-full" />;
  }

  if (!members || members.length === 0) {
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
            className="flex items-center justify-between gap-3 py-3 text-sm"
          >
            <div className="flex items-center gap-2">
              <span>
                {member.firstName} {member.lastName}
              </span>
              <span className="text-muted-foreground">{member.email}</span>
              {member.isAdmin && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {t("admin")}
                </span>
              )}
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
