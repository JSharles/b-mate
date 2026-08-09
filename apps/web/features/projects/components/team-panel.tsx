"use client";

import { Briefcase, Code2, Globe, Link2, Mail, Phone } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@/shared/components/ui/avatar";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";
import { Link } from "@/i18n/navigation";
import { useProjectMembers } from "../hooks";

const MAX_VISIBLE_AVATARS = 4;

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

function ContactRow({ icon: Icon, value }: { icon: LucideIcon; value: string | null }) {
  if (!value) {
    return null;
  }
  return (
    <span className="flex items-center gap-2 truncate text-muted-foreground">
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{value}</span>
    </span>
  );
}

// 2026-08-09 redesign: DeveloperCard and TeamSummaryCard used to be two
// separate cards on the client view's sidebar. Merged here — both read the
// same ProjectMember data, and neither carried enough distinct weight to
// deserve its own full card once Resources/Current Task were promoted to
// the page's main content. Client-view only: the contributor view keeps
// TeamSummaryCard as-is (a developer never needs "your developer" shown
// about themselves).
export function TeamPanel({
  projectId,
  isAdmin,
  className,
}: {
  projectId: string;
  isAdmin: boolean;
  className?: string;
}) {
  const { data: members, isPending } = useProjectMembers(projectId);
  const t = useTranslations("Projects.TeamPanel");

  // A project has, in practice, exactly one contributor today — the first
  // one found is shown as "the developer" (same simplification as the old
  // DeveloperCard).
  const developer = members?.find((member) => member.role === "contributor");
  const visibleMembers = members?.slice(0, MAX_VISIBLE_AVATARS) ?? [];
  const overflowCount = members ? Math.max(members.length - MAX_VISIBLE_AVATARS, 0) : 0;

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t("developer")}
          </h3>
          {isPending ? (
            <div className="flex flex-col items-center gap-2">
              <Skeleton className="size-20 rounded-full" />
              <Skeleton className="h-4 w-32" />
            </div>
          ) : !developer ? (
            <p className="text-sm text-muted-foreground">{t("developerEmpty")}</p>
          ) : (
            // "Fiche d'identité" treatment: a large, centered portrait
            // leads (this is the one person a client actually cares about
            // on this project), followed by every way to reach them —
            // unlike the compact row-avatar the Team section below uses,
            // where a dozen small faces in a stack would make more sense
            // than a dozen full identity cards.
            <div className="flex flex-col items-center gap-3 text-center">
              <Avatar className="size-20">
                <AvatarImage src={developer.image ?? undefined} alt="" />
                <AvatarFallback className="text-xl font-semibold">
                  {initials(developer.firstName, developer.lastName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="text-base font-semibold">
                  {developer.firstName} {developer.lastName}
                </span>
                <span className="text-xs text-muted-foreground">
                  {developer.roleTitle ?? t("roleFallback")}
                </span>
              </div>
              <div className="flex w-full flex-col gap-1.5 border-t pt-3 text-xs">
                <ContactRow icon={Mail} value={developer.email} />
                <ContactRow icon={Phone} value={developer.phone} />
                <ContactRow icon={Code2} value={developer.github} />
                <ContactRow icon={Briefcase} value={developer.linkedin} />
                <ContactRow icon={Link2} value={developer.malt} />
                <ContactRow icon={Globe} value={developer.website} />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t pt-4">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t("team")}
          </h3>
          {isPending ? (
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
            <p className="text-sm text-muted-foreground">{t("teamEmpty")}</p>
          )}
          <Button asChild type="button" variant="outline" size="sm" className="w-fit">
            {/* Same reasoning as the old TeamSummaryCard: only an admin can
                invite/remove on the team page — a non-admin only ever gets a
                read-only roster there. */}
            <Link href={`/projects/${projectId}/team`}>{isAdmin ? t("manage") : t("view")}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
