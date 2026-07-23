"use client";

import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { AvailableBoard } from "schemas";
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
import { useConnectBoard, usePreviewBoardConnection } from "../hooks";

interface ConnectBoardDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function errorMessage(error: unknown, generic: string): string {
  return error instanceof ApiError ? error.message : generic;
}

export function ConnectBoardDialog({ projectId, open, onOpenChange }: ConnectBoardDialogProps) {
  const t = useTranslations("Projects.ConnectBoardDialog");
  const tToasts = useTranslations("Toasts");
  const [token, setToken] = useState("");
  const [boards, setBoards] = useState<AvailableBoard[] | null>(null);
  const [selectedBoard, setSelectedBoard] = useState<AvailableBoard | null>(null);
  const preview = usePreviewBoardConnection(projectId);
  const connect = useConnectBoard(projectId);

  function reset() {
    setToken("");
    setBoards(null);
    setSelectedBoard(null);
    preview.reset();
    connect.reset();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  function handleTokenSubmit(event: React.FormEvent) {
    event.preventDefault();
    preview.mutate(
      { token },
      {
        onSuccess: (result) => setBoards(result),
      },
    );
  }

  function handleConnect() {
    if (!selectedBoard) return;
    connect.mutate(
      {
        token,
        ownerLogin: selectedBoard.ownerLogin,
        ownerType: selectedBoard.ownerType,
        number: selectedBoard.number,
      },
      { onSuccess: () => handleOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>

        {boards === null ? (
          <form onSubmit={handleTokenSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="board-connection-token">{t("tokenLabel")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("tokenHint")}{" "}
                <a
                  href="https://github.com/settings/tokens/new?scopes=project&description=b-mate"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {t("tokenHintLink")}
                </a>
              </p>
            </div>
            <Input
              id="board-connection-token"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              required
            />
            <Button type="submit" disabled={preview.isPending || token.length === 0}>
              {preview.isPending ? t("previewPending") : t("previewSubmit")}
            </Button>
            {preview.isError && (
              <p className="text-sm text-destructive">
                {errorMessage(preview.error, tToasts("genericError"))}
              </p>
            )}
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            {boards.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noBoards")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {boards.map((board) => {
                  const isSelected =
                    selectedBoard?.ownerLogin === board.ownerLogin &&
                    selectedBoard?.number === board.number;

                  return (
                    <li key={`${board.ownerLogin}-${board.number}`}>
                      <Button
                        type="button"
                        variant={isSelected ? "default" : "outline"}
                        className="w-full justify-between"
                        onClick={() => setSelectedBoard(board)}
                      >
                        <span>
                          {board.ownerLogin} / {board.title}
                        </span>
                        {isSelected && <CheckCircle2 className="size-4" />}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
            <Button
              type="button"
              disabled={!selectedBoard || connect.isPending}
              onClick={handleConnect}
            >
              {connect.isPending ? t("connectPending") : t("connectSubmit")}
            </Button>
            <Button type="button" variant="outline" onClick={() => setBoards(null)}>
              {t("back")}
            </Button>
            {connect.isError && (
              <p className="text-sm text-destructive">
                {errorMessage(connect.error, tToasts("genericError"))}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
