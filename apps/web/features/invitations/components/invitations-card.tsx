"use client";

import { MailPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useInvitations } from "../hooks";
import { InviteClientDialog } from "./invite-client-dialog";

export function InvitationsCard({ projectId }: { projectId: string }) {
  const { data: invitations, isPending } = useInvitations(projectId);
  const [open, setOpen] = useState(false);
  const t = useTranslations("Projects.InvitationsCard");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3">
        {isPending ? (
          <Skeleton className="h-5 w-24" />
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("pendingCount", { count: invitations?.length ?? 0 })}
          </p>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          <MailPlus className="size-4" />
          {t("invite")}
        </Button>
      </CardContent>

      <InviteClientDialog projectId={projectId} open={open} onOpenChange={setOpen} />
    </Card>
  );
}
