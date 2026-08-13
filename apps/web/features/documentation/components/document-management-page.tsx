"use client";

import {
  AlertCircle,
  ArrowLeft,
  BookOpenText,
  ChevronRight,
  FilePlus2,
  FileText,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { SourceDocument } from "schemas";
import { useProject } from "@/features/projects/hooks";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useDocumentationDocuments } from "../hooks";
import { AddDocumentDialog } from "./add-document-dialog";
import { DocumentStatus } from "./document-status";
import { RemoveDocumentDialog } from "./remove-document-dialog";

// A document is read once at upload and then it is in. There is nothing to
// stop, nothing to retry and no removal to resume: the only thing left to do
// with a document is take it back out (specs/018).
function DocumentActions({
  document,
  onRemove,
}: {
  document: SourceDocument;
  onRemove: () => void;
}) {
  const t = useTranslations("Projects.Documentation.Page");

  if (document.status === "removed") return null;

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="text-destructive hover:text-destructive"
        onClick={onRemove}
      >
        <Trash2 />
        {t("remove")}
      </Button>
    </div>
  );
}


export function DocumentManagementPage({ projectId }: { projectId: string }) {
  const t = useTranslations("Projects.Documentation.Page");
  const project = useProject(projectId);
  const documents = useDocumentationDocuments(projectId);
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [removalDocumentId, setRemovalDocumentId] = useState<string | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const isClient = project.data?.role === "client";

  useEffect(() => {
    if (isClient) router.replace(`/projects/${projectId}`);
  }, [isClient, projectId, router]);

  if (project.isPending || isClient) return <Skeleton className="h-48 w-full" />;
  if (project.isError || !project.data) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <AlertCircle className="size-8 text-destructive" />
        <p className="text-sm text-muted-foreground">{t("loadError")}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => project.refetch()}>
          {t("retry")}
        </Button>
      </div>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <div className="space-y-5">
        <Link
          href={`/projects/${projectId}`}
          className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("back")}
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">{t("documentsTitle")}</h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              {t("documentsDescription")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/projects/${projectId}/documentation`}>
                <BookOpenText />
                {t("openPipeline")}
              </Link>
            </Button>
            <Button ref={addButtonRef} type="button" onClick={() => setAddOpen(true)}>
              <FilePlus2 />
              {t("add")}
            </Button>
          </div>
        </div>
      </div>

      {/* The page IS the list now, so the h1 names it; repeating that as a
          section heading was one of the four names this surface used for the
          same thing. What is left is the count, which the h1 cannot carry. */}
      <section aria-labelledby="source-documents-count">
        <div className="mb-3 flex items-end justify-end gap-4">
          {documents.data && (
            <span id="source-documents-count" className="text-sm text-muted-foreground">
              {t("documentCount", { count: documents.data.total })}
            </span>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {documents.isPending ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : documents.isError ? (
            <div className="flex flex-col items-start gap-3 p-6">
              <p className="text-sm text-destructive">{t("documentsLoadError")}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => documents.refetch()}>
                {t("retry")}
              </Button>
            </div>
          ) : !documents.data?.items.length ? (
            <div className="flex flex-col items-start gap-3 p-8">
              <FileText className="size-6 text-muted-foreground" />
              <div>
                <p className="font-medium">{t("emptyTitle")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("emptyDescription")}</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(true)}>
                {t("addFirst")}
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {documents.data.items.map((document) => (
                <li key={document.id} className="flex min-h-20 items-center gap-3 px-4 py-3 sm:px-5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <FileText className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    {/* One link per row, and its accessible name is the title
                        alone. The status used to sit inside the anchor, so the
                        link renamed itself on every poll; and a second link to
                        the same URL made every document appear twice in a
                        screen reader's link list. */}
                    <Link
                      href={`/projects/${projectId}/documents/${document.id}`}
                      title={document.title}
                      className="block truncate rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {document.title}
                    </Link>
                    <DocumentStatus status={document.status} className="mt-1" />
                  </span>
                  <DocumentActions
                    document={document}
                    onRemove={() => setRemovalDocumentId(document.id)}
                  />
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </li>
              ))}
            </ul>
          )}
          {documents.hasNextPage && (
            <div className="border-t border-border p-4 sm:px-5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={documents.isFetchingNextPage}
                onClick={() => void documents.fetchNextPage()}
              >
                {t(documents.isFetchingNextPage ? "loadingMore" : "loadMore")}
              </Button>
            </div>
          )}
        </div>
      </section>

      <AddDocumentDialog projectId={projectId} open={addOpen} onOpenChange={setAddOpen} />
      <RemoveDocumentDialog
        projectId={projectId}
        documentId={removalDocumentId}
        open={Boolean(removalDocumentId)}
        onOpenChange={(open) => {
          if (open) return;
          setRemovalDocumentId(null);
          // The row that opened this dialog may no longer exist, so there is
          // nothing for Radix to restore focus to.
          addButtonRef.current?.focus();
        }}
      />
    </main>
  );
}
