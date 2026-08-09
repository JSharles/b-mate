"use client";

import { useTranslations } from "next-intl";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@/shared/components/ui/avatar";
import { SettingsRow } from "@/shared/components/settings-row";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { useProjectMembers } from "../hooks";

// Compact "who's on this project" summary — a stack of avatars plus a link
// to the full team page (/projects/[id]/team), replacing the old inline
// active/pending member list that used to live directly on this card (see
// team/page.tsx and project-members-list.tsx, which still hold all of that
// logic, just relocated).
const MAX_VISIBLE_AVATARS = 4;

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

export function TeamSummaryCard({
  projectId,
  isAdmin,
}: {
  projectId: string;
  isAdmin: boolean;
}) {
  const { data: members, isPending } = useProjectMembers(projectId);
  const t = useTranslations("Projects.TeamSummaryCard");

  const visibleMembers = members?.slice(0, MAX_VISIBLE_AVATARS) ?? [];
  const overflowCount = members ? Math.max(members.length - MAX_VISIBLE_AVATARS, 0) : 0;

  return (
    <SettingsRow
      title={t("title")}
      description={
        isPending ? (
          <Skeleton className="h-8 w-24" />
        ) : members && members.length > 0 ? (
          <AvatarGroup>
            {visibleMembers.map((member) => (
              <Avatar key={member.userId} title={`${member.firstName} ${member.lastName}`}>
                {member.image && <AvatarImage src={member.image} alt="" />}
                <AvatarFallback>{initials(member.firstName, member.lastName)}</AvatarFallback>
              </Avatar>
            ))}
            {overflowCount > 0 && (
              <AvatarGroupCount title={t("moreMembers", { count: overflowCount })}>
                +{overflowCount}
              </AvatarGroupCount>
            )}
          </AvatarGroup>
        ) : (
          t("empty")
        )
      }
    >
      <Button asChild type="button" variant="outline" size="sm" className="w-fit">
        {/* The label reflects what the viewer can actually do on the team
            page — only an admin can invite/remove there (see
            team/page.tsx); a non-admin viewer only ever sees a read-only
            roster, so "Manage" would promise a capability they don't
            have. */}
        <Link href={`/projects/${projectId}/team`}>{isAdmin ? t("manage") : t("view")}</Link>
      </Button>
    </SettingsRow>
  );
}
