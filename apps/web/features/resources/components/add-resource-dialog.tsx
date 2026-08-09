"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { useNotionConnectionStatus } from "@/shared/hooks/use-notion-connection-status";
import { ApiError } from "@/shared/lib/api-client";
import { cn } from "@/shared/lib/utils";
import { useConnectNotionResource, useUploadResource } from "../hooks";

interface AddResourceDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SourceTab = "upload" | "notion";

function errorMessage(error: unknown, generic: string): string {
  return error instanceof ApiError ? error.message : generic;
}

// specs/012-project-settings US2: the Notion integration token is
// configured once, standalone, in Settings (features/notion-connection) —
// this dialog never collects one. Unconfigured -> a message + link to
// Settings, nothing else; configured -> a page-URL field only.
export function AddResourceDialog({ projectId, open, onOpenChange }: AddResourceDialogProps) {
  const t = useTranslations("Projects.AddResourceDialog");
  const tToasts = useTranslations("Toasts");
  const [tab, setTab] = useState<SourceTab>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [notionPageUrl, setNotionPageUrl] = useState("");
  const upload = useUploadResource(projectId);
  const connectNotion = useConnectNotionResource(projectId);
  const notionStatus = useNotionConnectionStatus(projectId);
  const isNotionConnected = notionStatus.data?.connected ?? false;

  function reset() {
    setTab("upload");
    setFile(null);
    setNotionPageUrl("");
    upload.reset();
    connectNotion.reset();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  function handleUploadSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;
    upload.mutate(file, {
      onSuccess: () => handleOpenChange(false),
    });
  }

  function handleNotionSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!notionPageUrl) return;
    connectNotion.mutate(
      { pageUrl: notionPageUrl },
      { onSuccess: () => handleOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 rounded-md bg-muted p-1" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "upload"}
            onClick={() => setTab("upload")}
            className={cn(
              "flex-1 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
              tab === "upload"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
          >
            {t("uploadTab")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "notion"}
            onClick={() => setTab("notion")}
            className={cn(
              "flex-1 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
              tab === "notion"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
          >
            {t("notionTab")}
          </button>
        </div>

        {tab === "upload" ? (
          <form onSubmit={handleUploadSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="resource-file">{t("fileLabel")}</Label>
              <p className="text-xs text-muted-foreground">{t("fileHint")}</p>
            </div>
            <Input
              id="resource-file"
              type="file"
              accept=".pdf,.docx,image/png,image/jpeg"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <Button type="submit" disabled={!file || upload.isPending}>
              {upload.isPending ? t("uploadPending") : t("uploadSubmit")}
            </Button>
            {upload.isError && (
              <p className="text-sm text-destructive">
                {errorMessage(upload.error, tToasts("genericError"))}
              </p>
            )}
          </form>
        ) : isNotionConnected ? (
          <form onSubmit={handleNotionSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="resource-notion-page-url">{t("notionPageUrlLabel")}</Label>
              <Input
                id="resource-notion-page-url"
                type="text"
                value={notionPageUrl}
                onChange={(event) => setNotionPageUrl(event.target.value)}
              />
            </div>
            <Button type="submit" disabled={!notionPageUrl || connectNotion.isPending}>
              {connectNotion.isPending ? t("notionConnectPending") : t("notionConnectSubmit")}
            </Button>
            {connectNotion.isError && (
              <p className="text-sm text-destructive">
                {errorMessage(connectNotion.error, tToasts("genericError"))}
              </p>
            )}
          </form>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">{t("notionNotConnectedMessage")}</p>
            <Link
              href={`/projects/${projectId}`}
              className="w-fit text-sm text-primary hover:underline"
            >
              {t("notionGoToSettings")}
            </Link>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
