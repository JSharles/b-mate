"use client";

import { CheckCircle2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { AvailableBoard } from "schemas";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
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

// specs/010-github-oauth-board-connection: no more manual PAT paste, here
// or on a reconnect — a single "Continue with GitHub" action starts the
// OAuth flow (auth/board-oauth-cookie.ts carries the resulting token back
// server-side), landing back on this same dialog with `connectBoard=1` in
// the URL, at which point it calls preview() with no token at all — the
// cookie supplies it — and shows the board-picker step directly.
export function ConnectBoardDialog({ projectId, open, onOpenChange }: ConnectBoardDialogProps) {
  const t = useTranslations("Projects.ConnectBoardDialog");
  const tToasts = useTranslations("Toasts");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const [boards, setBoards] = useState<AvailableBoard[] | null>(null);
  const [selectedBoard, setSelectedBoard] = useState<AvailableBoard | null>(null);
  // specs/008-current-task-progress FR-005b — how the board's numeric
  // "Estimate" field converts to a duration when there's no "Target date"
  // field to read directly. Defaults to "days", the common convention.
  const [estimateUnit, setEstimateUnit] = useState<"days" | "hours">("days");
  const preview = usePreviewBoardConnection(projectId);
  const connect = useConnectBoard(projectId);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  const authorizeHref = `${apiUrl}/projects/${projectId}/board-connection/github/authorize?locale=${locale}`;
  const returningFromGithub = searchParams.get("connectBoard") === "1";

  useEffect(() => {
    if (open && boards === null && returningFromGithub && !preview.isPending) {
      preview.mutate({}, { onSuccess: (result) => setBoards(result) });
    }
    // Only re-run when the dialog opens or the URL flag changes — not on
    // every preview.isPending tick, which would re-fire this effect
    // mid-request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, boards, returningFromGithub]);

  function reset() {
    setBoards(null);
    setSelectedBoard(null);
    setEstimateUnit("days");
    preview.reset();
    connect.reset();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  function handleConnect() {
    if (!selectedBoard) return;
    connect.mutate(
      {
        ownerLogin: selectedBoard.ownerLogin,
        ownerType: selectedBoard.ownerType,
        number: selectedBoard.number,
        estimateUnit,
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
          <div className="flex flex-col gap-3">
            {returningFromGithub && preview.isPending ? (
              <p className="text-sm text-muted-foreground">{t("previewPending")}</p>
            ) : (
              <Button asChild>
                <a href={authorizeHref}>{t("continueWithGithub")}</a>
              </Button>
            )}
            {preview.isError && (
              <p className="text-sm text-destructive">
                {errorMessage(preview.error, tToasts("genericError"))}
              </p>
            )}
          </div>
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
            <div className="flex flex-col gap-1">
              <Label>{t("estimateUnitLabel")}</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={estimateUnit === "days" ? "default" : "outline"}
                  onClick={() => setEstimateUnit("days")}
                >
                  {t("estimateUnitDays")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={estimateUnit === "hours" ? "default" : "outline"}
                  onClick={() => setEstimateUnit("hours")}
                >
                  {t("estimateUnitHours")}
                </Button>
              </div>
            </div>
            <Button
              type="button"
              disabled={!selectedBoard || connect.isPending}
              onClick={handleConnect}
            >
              {connect.isPending ? t("connectPending") : t("connectSubmit")}
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
