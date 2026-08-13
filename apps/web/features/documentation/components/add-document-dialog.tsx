"use client";

import { FileUp, Link2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/shared/components/ui/tabs";
import { useNotionConnectionStatus } from "@/shared/hooks/use-notion-connection-status";
import { ApiError } from "@/shared/lib/api-client";
import { useAddNotionDocument, useUploadDocument } from "../hooks";

interface AddDocumentDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type InputKind = "upload" | "notion";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

export function AddDocumentDialog({
  projectId,
  open,
  onOpenChange,
}: AddDocumentDialogProps) {
  const t = useTranslations("Projects.Documentation.AddDocument");
  const tToasts = useTranslations("Toasts");
  const [kind, setKind] = useState<InputKind>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [pageUrl, setPageUrl] = useState("");
  const upload = useUploadDocument(projectId);
  const addNotion = useAddNotionDocument(projectId);
  const notion = useNotionConnectionStatus(projectId, { enabled: open });

  function reset() {
    setKind("upload");
    setFile(null);
    setPageUrl("");
    upload.reset();
    addNotion.reset();
  }

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

      {/* This announced itself as a tablist while implementing none of the
          contract — no tabpanel, no aria-controls, no roving tabindex, no
          arrow keys. Promising tab semantics and not delivering them is worse
          for a screen-reader user than plain buttons, so it uses the real
          primitive now. */}
      <Tabs value={kind} onValueChange={(value) => setKind(value as "upload" | "notion")}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="upload">
            <FileUp />
            {t("uploadTab")}
          </TabsTrigger>
          <TabsTrigger value="notion">
            <Link2 />
            {t("notionTab")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload">
          <form
            key="upload"
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!file) return;
              upload.mutate(file, { onSuccess: () => changeOpen(false) });
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="source-document-file">{t("fileLabel")}</Label>
              <Input
                id="source-document-file"
                type="file"
                accept=".pdf,.docx,image/png,image/jpeg"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              <p className="text-xs leading-relaxed text-muted-foreground">{t("fileHint")}</p>
            </div>
            {upload.isError && (
              <p role="alert" className="text-sm text-destructive">
                {errorMessage(upload.error, tToasts("genericError"))}
              </p>
            )}
            <Button type="submit" disabled={!file || upload.isPending}>
              {upload.isPending ? t("uploadPending") : t("uploadSubmit")}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="notion">
          {notion.isPending ? (
            <p className="py-4 text-sm text-muted-foreground">{t("notionChecking")}</p>
          ) : notion.data?.connected ? (
          <form
            key="notion"
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!pageUrl) return;
              addNotion.mutate(
                { pageUrl },
                { onSuccess: () => changeOpen(false) },
              );
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="source-document-notion-url">{t("notionPageUrlLabel")}</Label>
              <Input
                id="source-document-notion-url"
                type="url"
                value={pageUrl}
                placeholder="https://notion.so/…"
                onChange={(event) => setPageUrl(event.target.value)}
              />
            </div>
            {addNotion.isError && (
              <p role="alert" className="text-sm text-destructive">
                {errorMessage(addNotion.error, tToasts("genericError"))}
              </p>
            )}
            <Button type="submit" disabled={!pageUrl || addNotion.isPending}>
              {addNotion.isPending ? t("notionPending") : t("notionSubmit")}
            </Button>
          </form>
          ) : (
            <div className="flex flex-col gap-3 py-2">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t("notionUnavailable")}
              </p>
              <Button asChild variant="outline" className="w-fit">
                <Link href={`/projects/${projectId}#project-tools`}>{t("configureNotion")}</Link>
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
      </DialogContent>
    </Dialog>
  );
}
