"use client";

import {
  AlertCircle,
  ArrowLeft,
  Download,
  ExternalLink,
  FileText,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { use, useEffect, useState } from "react";
import { RemoveDocumentDialog } from "@/features/documentation/components/remove-document-dialog";
import { DocumentStatus } from "@/features/documentation/components/document-status";
import { useSourceDocument } from "@/features/documentation/hooks";
import { useProject } from "@/features/projects/hooks";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";

export default function SourceDocumentPage({
  params,
}: {
  params: Promise<{ id: string; documentId: string }>;
}) {
  const { id, documentId } = use(params);
  const t = useTranslations("Projects.Documentation.DocumentDetail");
  const project = useProject(id);
  const document = useSourceDocument(id, documentId);
  const router = useRouter();
  const [removeOpen, setRemoveOpen] = useState(false);
  const isClient = project.data?.role === "client";

  useEffect(() => {
    if (isClient) router.replace(`/projects/${id}`);
  }, [id, isClient, router]);

  if (project.isPending || document.isPending || isClient) {
    return <Skeleton className="h-40 w-full" />;
  }
  if (project.isError || document.isError || !project.data || !document.data) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <AlertCircle className="size-8 text-destructive" />
        <p className="text-sm text-muted-foreground">{t("loadError")}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => document.refetch()}
        >
          {t("retry")}
        </Button>
      </div>
    );
  }

  const item = document.data;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <Link
        href={`/projects/${id}/documents`}
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t("back")}
      </Link>

      <article className="overflow-hidden rounded-xl border border-border bg-card">
        <header className="flex flex-col gap-4 border-b border-border px-6 py-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="size-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold">{item.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {item.kind === "notion"
                  ? t("notionDocument")
                  : t("uploadedDocument")}
              </p>
            </div>
          </div>
          <DocumentStatus status={item.status} className="text-sm" />
        </header>

        <div className="grid gap-8 px-6 py-6 sm:grid-cols-[1fr_auto]">
          <div className="space-y-5">
            <div>
              <h2 className="text-sm font-semibold">{t("roleTitle")}</h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {t("roleDescription")}
              </p>
            </div>
            {item.failureCode && (
              <div role="alert" className="space-y-2 text-sm text-destructive">
                <p>{t("processingFailureHelp")}</p>
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">
                    {t("technicalDetails")}
                  </summary>
                  <p className="mt-1">
                    {t("failureCode", { code: item.failureCode })}
                  </p>
                </details>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            {/* The only thing left to do with a document is take it back
                out: it is read once at upload and then it is in. */}
            {item.status !== "removed" && (
              <Button
                type="button"
                variant="outline"
                className="w-full text-destructive hover:text-destructive sm:w-auto"
                onClick={() => setRemoveOpen(true)}
              >
                <Trash2 />
                {t("removeDocument")}
              </Button>
            )}
            {item.originalDownloadUrl && (
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <a
                  href={item.originalDownloadUrl}
                  download={item.originalFileName ?? undefined}
                >
                  <Download />
                  {t("downloadOriginal")}
                </a>
              </Button>
            )}
            {item.externalUrl && (
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <a
                  href={item.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink />
                  {t("openOriginal")}
                </a>
              </Button>
            )}
          </div>
        </div>
      </article>

      <RemoveDocumentDialog
        projectId={id}
        documentId={documentId}
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        onRemoved={() => router.replace(`/projects/${id}/documents`)}
      />
    </div>
  );
}
