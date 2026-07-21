"use client";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { SITE_URL } from "@/shared/lib/site-url";
import { useCancelInvitation, useInvitations, useResendInvitation } from "../hooks";

function invitationLink(token: string) {
  return `${SITE_URL}/invite/${token}`;
}

function CopyLinkButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const t = useTranslations("Projects.InvitationsList");

  async function handleCopy() {
    await navigator.clipboard.writeText(invitationLink(token));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      {copied ? t("copied") : t("copyLink")}
    </Button>
  );
}

export function InvitationsList({ projectId }: { projectId: string }) {
  const { data: invitations, isPending } = useInvitations(projectId);
  const cancelInvitation = useCancelInvitation(projectId);
  const resendInvitation = useResendInvitation(projectId);
  const t = useTranslations("Projects.InvitationsList");

  if (isPending) {
    return <Skeleton className="h-16 w-full" />;
  }

  if (!invitations || invitations.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <ul className="flex flex-col divide-y border-t">
      {invitations.map((invitation) => (
        <li key={invitation.id} className="flex items-center justify-between gap-3 py-3 text-sm">
          <span>{invitation.email}</span>
          <div className="flex items-center gap-2">
            <CopyLinkButton token={invitation.token} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={resendInvitation.isPending}
              onClick={() => resendInvitation.mutate(invitation.id)}
            >
              {resendInvitation.isPending && resendInvitation.variables === invitation.id
                ? t("resending")
                : t("resend")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={cancelInvitation.isPending}
              onClick={() => cancelInvitation.mutate(invitation.id)}
            >
              {cancelInvitation.isPending && cancelInvitation.variables === invitation.id
                ? t("cancelling")
                : t("cancel")}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
