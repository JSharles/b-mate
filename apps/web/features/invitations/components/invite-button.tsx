"use client";

import { MailPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { InviteClientDialog } from "./invite-client-dialog";

export function InviteButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("Projects.InviteButton");

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <MailPlus className="size-4" />
        {t("invite")}
      </Button>

      <InviteClientDialog projectId={projectId} open={open} onOpenChange={setOpen} />
    </>
  );
}
