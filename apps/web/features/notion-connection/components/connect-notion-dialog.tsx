"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { ApiError } from "@/shared/lib/api-client";
import { useConnectNotionConnection } from "../hooks";

interface ConnectNotionDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function errorMessage(error: unknown, generic: string): string {
  return error instanceof ApiError ? error.message : generic;
}

export function ConnectNotionDialog({ projectId, open, onOpenChange }: ConnectNotionDialogProps) {
  const t = useTranslations("Projects.ConnectNotionDialog");
  const tToasts = useTranslations("Toasts");
  const [token, setToken] = useState("");
  const connect = useConnectNotionConnection(projectId);

  function reset() {
    setToken("");
    connect.reset();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    connect.mutate({ token }, { onSuccess: () => handleOpenChange(false) });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="notion-connection-token">{t("tokenLabel")}</Label>
            <p className="text-xs text-muted-foreground">
              {t("tokenHint")}{" "}
              <a
                href="https://www.notion.so/my-integrations"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                notion.so/my-integrations ↗
              </a>
            </p>
            <Input
              id="notion-connection-token"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={!token || connect.isPending}>
            {connect.isPending ? t("connectPending") : t("connectSubmit")}
          </Button>
          {connect.isError && (
            <p className="text-sm text-destructive">
              {errorMessage(connect.error, tToasts("genericError"))}
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
