"use client";

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
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
import { useDocumentationDocuments, useReferenceSummary } from "../hooks";
import { AddDocumentDialog } from "./add-document-dialog";
import { DocumentStatus } from "./document-status";
import { ReferenceDocumentView } from "./reference-document-view";
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
  const t = useTranslations("Projects.Documentation.Base");

  if (document.status === "removed") return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="shrink-0 text-muted-foreground hover:text-destructive"
      onClick={onRemove}
    >
      <Trash2 />
      {t("remove")}
    </Button>
  );
}

// What the client-facing documentation runs on: the documents the developer
// put in, and the document Diaphane wrote from them. It is reached from the
// documentation rather than sitting beside it — feeding the machine is not the
// same kind of thing as using it (specs/019).
export function DocumentarySourcesPage({ projectId }: { projectId: string }) {
  const t = useTranslations("Projects.Documentation.Base");
  const project = useProject(projectId);
  const documents = useDocumentationDocuments(projectId);
  const summary = useReferenceSummary(projectId);
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [removalDocumentId, setRemovalDocumentId] = useState<string | null>(
    null,
  );
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const isClient = project.data?.role === "client";

  // Contributor-only. The API enforces the same rule independently.
  useEffect(() => {
    if (isClient) router.replace(`/projects/${projectId}`);
  }, [isClient, projectId, router]);

  if (project.isPending || isClient) return <Skeleton className="h-48 w-full" />;
  if (project.isError || !project.data) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <AlertCircle className="size-8 text-destructive" />
        <p className="text-sm text-muted-foreground">{t("loadError")}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => project.refetch()}
        >
          {t("retry")}
        </Button>
      </div>
    );
  }

  const items = documents.data?.items ?? [];

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-10">
      <div className="space-y-5 print:hidden">
        <Link
          href={`/projects/${projectId}/documentation`}
          className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("back")}
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {t("description")}
          </p>
        </div>
      </div>

      <section aria-labelledby="documents-title" className="print:hidden">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="documents-title" className="font-semibold">
              {t("documentsTitle")}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {t("documentsDescription")}
            </p>
          </div>
          <Button
            ref={addButtonRef}
            type="button"
            variant="outline"
            onClick={() => setAddOpen(true)}
          >
            <FilePlus2 />
            {t("add")}
          </Button>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
          {documents.isPending ? (
            <div className="p-4">
              <Skeleton className="h-16 w-full" />
            </div>
          ) : documents.isError ? (
            // A failed request is not an empty base.
            <p role="alert" className="p-5 text-sm text-destructive">
              {t("documentsLoadError")}
            </p>
          ) : items.length === 0 ? (
            <div className="p-6">
              <p className="text-sm text-muted-foreground">{t("emptyTitle")}</p>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                {t("emptyDescription")}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((document) => (
                <li
                  key={document.id}
                  className="flex min-h-16 items-center gap-3 px-4 py-3 sm:px-5"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <FileText className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    {/* One link per row, and its accessible name is the title
                        alone: the status used to sit inside the anchor, so the
                        link renamed itself on every poll. */}
                    <Link
                      href={`/projects/${projectId}/documentation/sources/${document.id}`}
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
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
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

      <section aria-labelledby="reference-title" className="border-t border-border pt-10">
        <div className="print:hidden">
          <h2 id="reference-title" className="font-semibold">
            {t("referenceTitle")}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t("referenceDescription")}
          </p>
        </div>
        <div className="mt-6">
          <ReferenceDocumentView projectId={projectId} />
        </div>
      </section>

      {/* Where this leads once the document is written. Offered here because
          finishing the reference is exactly when the developer is ready for the
          job this one serves. */}
      {summary.data?.document?.status === "ready" && (
        <Link
          href={`/projects/${projectId}/documentation`}
          className="inline-flex w-fit items-center gap-2 rounded-md text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring print:hidden"
        >
          {t("toClientContent")}
          <ArrowRight className="size-4" />
        </Link>
      )}

      <AddDocumentDialog
        projectId={projectId}
        open={addOpen}
        onOpenChange={setAddOpen}
      />
      <RemoveDocumentDialog
        projectId={projectId}
        documentId={removalDocumentId}
        open={Boolean(removalDocumentId)}
        onOpenChange={(open) => {
          if (open) return;
          setRemovalDocumentId(null);
          // The row that opened this dialog may no longer exist, so focus goes
          // back to something that certainly does.
          addButtonRef.current?.focus();
        }}
      />
    </main>
  );
}
