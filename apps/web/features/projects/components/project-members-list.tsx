"use client";

import { useTranslations } from "next-intl";
import type { MouseEvent } from "react";
import { useState } from "react";
import type { ProjectMember } from "schemas";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { ApiError } from "@/shared/lib/api-client";
import { useProjectMembers, useRemoveMember } from "../hooks";

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

function errorMessage(error: unknown, generic: string): string {
  return error instanceof ApiError ? error.message : generic;
}

interface ProjectMembersListProps {
  projectId: string;
  canManageMembers: boolean;
}

export function ProjectMembersList({ projectId, canManageMembers }: ProjectMembersListProps) {
  const { data: members, isPending, isError } = useProjectMembers(projectId);
  const removeMember = useRemoveMember(projectId);
  const t = useTranslations("Projects.ProjectMembersList");
  const tToasts = useTranslations("Toasts");
  // Tracks the member object, not just an id, so the confirm dialog's copy
  // survives a member-list refetch while it's open (see
  // notion-connection-card.tsx / board-connection-card.tsx for the same
  // disconnect-confirmation pattern this reuses).
  const [memberToRemove, setMemberToRemove] = useState<ProjectMember | null>(null);

  function handleConfirmOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      removeMember.reset();
      setMemberToRemove(null);
    }
  }

  // AlertDialogAction is Radix's DialogPrimitive.Close under the hood, so it
  // dismisses the dialog on click by default regardless of outcome —
  // preventDefault() here keeps it open until the mutation actually
  // settles, closing only on success. Cancel's `disabled` and the Escape
  // guard below close the other two dismissal paths (outside-click is
  // already blocked by AlertDialogContent itself), so the dialog is
  // genuinely un-dismissable while pending, not just visually so.
  function handleRemove(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (!memberToRemove) return;
    removeMember.mutate(memberToRemove.userId, { onSuccess: () => setMemberToRemove(null) });
  }

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
    <>
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
                  onClick={() => setMemberToRemove(member)}
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

      <AlertDialog open={memberToRemove !== null} onOpenChange={handleConfirmOpenChange}>
        <AlertDialogContent
          onEscapeKeyDown={(event) => {
            if (removeMember.isPending) event.preventDefault();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("removeConfirmTitle", {
                name: memberToRemove ? `${memberToRemove.firstName} ${memberToRemove.lastName}` : "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("removeConfirmDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          {removeMember.isError && (
            <p className="text-sm text-destructive">
              {errorMessage(removeMember.error, tToasts("genericError"))}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMember.isPending}>
              {t("removeConfirmCancel")}
            </AlertDialogCancel>
            <AlertDialogAction disabled={removeMember.isPending} onClick={handleRemove}>
              {removeMember.isPending ? t("removing") : t("removeConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
