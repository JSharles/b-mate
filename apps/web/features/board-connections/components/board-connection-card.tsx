"use client";

import { ExternalLink, KanbanSquare, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useBoardConnection, useDisconnectBoard } from "../hooks";
import { ConnectBoardDialog } from "./connect-board-dialog";

export function BoardConnectionCard({ projectId }: { projectId: string }) {
  const searchParams = useSearchParams();
  // specs/010-github-oauth-board-connection: the GitHub OAuth callback
  // redirects back here with ?connectBoard=1 — open straight into the
  // dialog's board-picker step instead of making the developer click
  // "Connect" again after already authorizing.
  const [open, setOpen] = useState(() => searchParams.get("connectBoard") === "1");
  const { data: connection, isPending } = useBoardConnection(projectId);
  const disconnect = useDisconnectBoard(projectId);
  const t = useTranslations("Projects.BoardConnectionCard");

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            {t("title")}
          </h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3">
        {isPending ? (
          <Skeleton className="h-5 w-32" />
        ) : connection?.needsReconnect ? (
          // specs/010-github-oauth-board-connection FR-008: the background
          // sweep detected the stored GitHub authorization was revoked —
          // surface it clearly rather than letting the board silently go
          // stale.
          <p className="flex items-center gap-2 text-sm text-destructive">
            <TriangleAlert className="size-4 shrink-0" />
            {t("needsReconnect")}
          </p>
        ) : connection ? (
          <a
            href={connection.boardUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-sm text-foreground hover:underline"
          >
            {t("connectedTo", { title: connection.boardTitle })}
            <ExternalLink className="size-3.5 shrink-0" />
          </a>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <KanbanSquare className="size-4 shrink-0" />
            {t("notConnected")}
          </p>
        )}

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
            onClick={() => disconnect.mutate()}
          >
            {disconnect.isPending ? t("disconnecting") : t("disconnect")}
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            {t("connect")}
          </Button>
        )}
      </CardContent>

      <ConnectBoardDialog projectId={projectId} open={open} onOpenChange={setOpen} />
    </Card>
  );
}
