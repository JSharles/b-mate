"use client";

import { ExternalLink, KanbanSquare, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import type { MouseEvent } from "react";
import { useState } from "react";
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
import { SettingsRow } from "@/shared/components/settings-row";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { ApiError } from "@/shared/lib/api-client";
import { useBoardConnection, useDisconnectBoard } from "../hooks";
import { ConnectBoardDialog } from "./connect-board-dialog";

function errorMessage(error: unknown, generic: string): string {
  return error instanceof ApiError ? error.message : generic;
}

export function BoardConnectionCard({ projectId }: { projectId: string }) {
  const searchParams = useSearchParams();
  // specs/010-github-oauth-board-connection: the GitHub OAuth callback
  // redirects back here with ?connectBoard=1 — open straight into the
  // dialog's board-picker step instead of making the developer click
  // "Connect" again after already authorizing.
  const [open, setOpen] = useState(() => searchParams.get("connectBoard") === "1");
  const [confirmDisconnectOpen, setConfirmDisconnectOpen] = useState(false);
  const { data: connection, isPending } = useBoardConnection(projectId);
  const disconnect = useDisconnectBoard(projectId);
  const t = useTranslations("Projects.BoardConnectionCard");
  const tToasts = useTranslations("Toasts");

  function handleConfirmOpenChange(nextOpen: boolean) {
    if (!nextOpen) disconnect.reset();
    setConfirmDisconnectOpen(nextOpen);
  }

  // AlertDialogAction is Radix's DialogPrimitive.Close under the hood, so it
  // dismisses the dialog on click by default regardless of outcome —
  // preventDefault() here keeps it open until the mutation actually
  // settles, closing only on success, so a slow or failed disconnect stays
  // visible instead of silently reading as "done".
  function handleDisconnect(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    disconnect.mutate(undefined, { onSuccess: () => setConfirmDisconnectOpen(false) });
  }

  return (
    <>
      <SettingsRow
        title={t("title")}
        description={
          isPending ? (
            <Skeleton className="h-4 w-32" />
          ) : connection?.needsReconnect ? (
            // specs/010-github-oauth-board-connection FR-008: the background
            // sweep detected the stored GitHub authorization was revoked —
            // surface it clearly rather than letting the board silently go
            // stale.
            <span className="flex items-center gap-1.5 text-destructive">
              <TriangleAlert className="size-3.5 shrink-0" />
              {t("needsReconnect")}
            </span>
          ) : connection ? (
            <a
              href={connection.boardUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 hover:text-foreground hover:underline"
            >
              {t("connectedTo", { title: connection.boardTitle })}
              <ExternalLink className="size-3.5 shrink-0" />
            </a>
          ) : (
            <span className="flex items-center gap-1.5">
              <KanbanSquare className="size-3.5 shrink-0" />
              {t("notConnected")}
            </span>
          )
        }
      >
        {connection?.needsReconnect ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            {t("reconnect")}
          </Button>
        ) : connection ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disconnect.isPending}
            onClick={() => setConfirmDisconnectOpen(true)}
          >
            {disconnect.isPending ? t("disconnecting") : t("disconnect")}
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            {t("connect")}
          </Button>
        )}
      </SettingsRow>

      <ConnectBoardDialog projectId={projectId} open={open} onOpenChange={setOpen} />

      <AlertDialog open={confirmDisconnectOpen} onOpenChange={handleConfirmOpenChange}>
        {/* reset() only clears the mutation's local state — it doesn't cancel
            the in-flight request. Outside-click is already blocked by Radix's
            own AlertDialogContent; Escape and the disabled Cancel button
            below close the remaining two paths, so the dialog is genuinely
            un-dismissable while pending instead of just looking that way. */}
        <AlertDialogContent
          onEscapeKeyDown={(event) => {
            if (disconnect.isPending) event.preventDefault();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{t("disconnectConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("disconnectConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {disconnect.isError && (
            <p className="text-sm text-destructive">
              {errorMessage(disconnect.error, tToasts("genericError"))}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnect.isPending}>
              {t("disconnectConfirmCancel")}
            </AlertDialogCancel>
            <AlertDialogAction disabled={disconnect.isPending} onClick={handleDisconnect}>
              {disconnect.isPending ? t("disconnecting") : t("disconnectConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
