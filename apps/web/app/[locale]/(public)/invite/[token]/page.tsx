"use client";

import { useTranslations } from "next-intl";
import { use } from "react";
import { AcceptInvitationForm } from "@/features/invitations/components/accept-invitation-form";
import { useInvitationDetails } from "@/features/invitations/hooks";
import { Skeleton } from "@/shared/components/ui/skeleton";

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { data: invitation, isPending } = useInvitationDetails(token);
  const t = useTranslations("Invite");

  if (isPending) {
    return (
      <main className="flex flex-1 items-center justify-center px-6">
        <Skeleton className="h-8 w-64" />
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {!invitation ? (
          <p className="text-sm text-destructive">{t("invalidLink")}</p>
        ) : invitation.status === "expired" || invitation.status === "cancelled" ? (
          <p className="text-sm text-destructive">{t("noLongerAvailable")}</p>
        ) : invitation.status === "accepted" ? (
          <p className="text-sm text-destructive">{t("alreadyAccepted")}</p>
        ) : (
          <>
            <h1 className="mb-2 text-2xl font-semibold">{t("title")}</h1>
            <p className="mb-6 text-muted-foreground">{invitation.projectTitle}</p>
            <AcceptInvitationForm
              token={token}
              email={invitation.email}
              accountExists={invitation.accountExists}
            />
          </>
        )}
      </div>
    </main>
  );
}
