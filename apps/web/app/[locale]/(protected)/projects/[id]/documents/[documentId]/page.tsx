"use client";

import {
  AlertCircle,
  ArrowLeft,
  CircleSlash,
  Download,
  ExternalLink,
  FileText,
  LoaderCircle,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { use, useEffect, useState } from "react";
import { RemoveDocumentDialog } from "@/features/documentation/components/remove-document-dialog";
import {
  CANCELLED_BY_CONTRIBUTOR,
  DocumentStatus,
  PROCESSING_STATUSES,
} from "@/features/documentation/components/document-status";
import {
  useCancelDocumentProcessing,
  useRetryDocumentProcessing,
  useRetryDocumentRemoval,
  useSourceDocument,
} from "@/features/documentation/hooks";
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
  const retryProcessing = useRetryDocumentProcessing(id);
  const retryRemoval = useRetryDocumentRemoval(id);
  const cancelProcessing = useCancelDocumentProcessing(id);
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
  const removing = item.status === "removal_pending";
  const processing = PROCESSING_STATUSES.has(item.status);
  const cancelled = item.failureCode === CANCELLED_BY_CONTRIBUTOR;
  const processingFailed = item.status === "failed";
  const removalFailed = item.status === "removal_failed";
  const actionError =
    retryProcessing.isError ||
    cancelProcessing.isError ||
    retryRemoval.isError ||
    retryRemoval.data?.status === "needs_attention";

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
          <DocumentStatus
            status={item.status}
            failureCode={item.failureCode}
            className="text-sm"
          />
        </header>

        <div className="grid gap-8 px-6 py-6 sm:grid-cols-[1fr_auto]">
          <div className="space-y-5">
            <div>
              <h2 className="text-sm font-semibold">{t("roleTitle")}</h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {t("roleDescription")}
              </p>
            </div>
            {/* A stop is not an incident. Reported through the failure block
                the page contradicted its own status line — "Traitement arrêté"
                above, "le traitement n'a pas abouti" in red below — and
                offered a technical code for something the contributor did on
                purpose. */}
            {cancelled && (
              <p className="text-sm text-muted-foreground">
                {t("cancelledHelp")}
              </p>
            )}
            {item.failureCode && !cancelled && (
              <div role="alert" className="space-y-2 text-sm text-destructive">
                <p>{t(processingFailed ? "processingFailureHelp" : "removalFailureHelp")}</p>
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">{t("technicalDetails")}</summary>
                  <p className="mt-1">{t("failureCode", { code: item.failureCode })}</p>
                </details>
              </div>
            )}
            {actionError && (
              <p role="alert" className="text-sm text-destructive">
                {t(
                  removalFailed ? "retryRemovalError" : "retryProcessingError",
                )}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            {/* The list row offers this; the detail page did not, so opening a
                document being processed was a dead end — the one place with
                room to explain the wait had no way out of it. */}
            {processing && (
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                disabled={cancelProcessing.isPending}
                onClick={() => cancelProcessing.mutate(documentId)}
              >
                {cancelProcessing.isPending ? (
                  <LoaderCircle className="animate-spin motion-reduce:animate-none" />
                ) : (
                  <CircleSlash />
                )}
                {t(
                  cancelProcessing.isPending
                    ? "cancellingProcessing"
                    : "cancelProcessing",
                )}
              </Button>
            )}
            {processingFailed && (
              <>
                <Button
                  type="button"
                  className="w-full sm:w-auto"
                  disabled={retryProcessing.isPending}
                  onClick={() => retryProcessing.mutate(documentId)}
                >
                  {retryProcessing.isPending ? (
                    <LoaderCircle className="animate-spin motion-reduce:animate-none" />
                  ) : (
                    <RotateCcw />
                  )}
                  {t(
                    retryProcessing.isPending
                      ? "retryingProcessing"
                      : "retryProcessing",
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full text-destructive hover:text-destructive sm:w-auto"
                  onClick={() => setRemoveOpen(true)}
                >
                  <Trash2 />
                  {t("removeDocument")}
                </Button>
              </>
            )}
            {(removalFailed || removing) && (
              <Button
                type="button"
                className="w-full sm:w-auto"
                disabled={retryRemoval.isPending}
                onClick={() =>
                  retryRemoval.mutate(documentId, {
                    onSuccess: (result) => {
                      if (result.status === "completed") {
                        router.replace(`/projects/${id}/documents`);
                      }
                    },
                  })
                }
              >
                {retryRemoval.isPending ? (
                  <LoaderCircle className="animate-spin motion-reduce:animate-none" />
                ) : (
                  <RotateCcw />
                )}
                {t(retryRemoval.isPending ? "retryingRemoval" : "retryRemoval")}
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
