"use client";

import { useState } from "react";
import { LoaderCircle, PencilLine, RefreshCw, SearchX, ShieldCheck, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReferenceBlock, ReferencePart } from "schemas";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useReferenceDocument, useWriteReferenceDocument } from "../hooks";
import { GuidedCorrectionDialog } from "./guided-correction-dialog";
import { ProvenanceSheet } from "./provenance-sheet";

// A passage, set as continuous text. Its provenance and its correction take no
// layout at rest — the whole reason the old list was unreadable was that every
// sentence carried a label, two buttons and a rule (specs/018).
function Passage({
  block,
  onProvenance,
  onCorrect,
}: {
  block: ReferenceBlock;
  onProvenance: (itemId: string) => void;
  onCorrect: (itemId: string) => void;
}) {
  const t = useTranslations("Projects.Documentation.Reference");
  const itemId = block.informationItemIds[0];

  return (
    <div className="group relative">
      <p
        className={
          block.kind === "open_point"
            ? "rounded-lg border border-border bg-muted px-4 py-3 text-sm leading-7"
            : "max-w-3xl text-sm leading-7"
        }
      >
        {block.kind === "open_point" && (
          <span className="mr-2 text-xs uppercase tracking-wide text-muted-foreground">
            {t("openPoint")}
          </span>
        )}
        {block.text}
      </p>
      <div className="mt-1 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <Button type="button" variant="ghost" size="xs" onClick={() => onProvenance(itemId)}>
          <ShieldCheck />
          {t("showSource")}
        </Button>
        <Button type="button" variant="ghost" size="xs" onClick={() => onCorrect(itemId)}>
          <PencilLine />
          {t("correct")}
        </Button>
      </div>
    </div>
  );
}

export function ReferenceDocumentView({ projectId }: { projectId: string }) {
  const t = useTranslations("Projects.Documentation.Reference");
  const document = useReferenceDocument(projectId);
  const write = useWriteReferenceDocument(projectId);
  const [provenanceFor, setProvenanceFor] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<string | null>(null);

  const current = document.data;

  if (document.isPending) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label={t("loading")}>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  // A failed request is not a project without a document.
  if (document.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {t("loadError")}
      </p>
    );
  }

  const writeAction = (
    <Button type="button" onClick={() => write.mutate()} disabled={write.isPending}>
      {write.isPending ? (
        <LoaderCircle className="animate-spin motion-reduce:animate-none" />
      ) : (
        <RefreshCw />
      )}
      {current ? t("rewrite") : t("write")}
    </Button>
  );

  if (!current) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6">
        <p className="text-sm text-muted-foreground">{t("neverWritten")}</p>
        <div className="mt-4">{writeAction}</div>
      </div>
    );
  }

  if (current.status === "writing") {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
        {t("writing")}
      </p>
    );
  }

  if (current.status === "failed") {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 p-4 text-sm">
        <TriangleAlert className="size-4 shrink-0 text-destructive" />
        {/* The document that was there is still readable; this costs a retry. */}
        <p className="flex-1">{t("failed")}</p>
        {writeAction}
      </div>
    );
  }

  if (current.outcome === "nothing_usable") {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
        <SearchX className="mt-0.5 size-4 shrink-0" />
        <p>{t("nothingUsable")}</p>
      </div>
    );
  }

  const parts = current.parts as ReferencePart[];
  const statementText = new Map(
    current.citedStatements.map(({ id, content }) => [id, content]),
  );

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-muted-foreground">
          {t("writtenFrom", { count: parts.length })}
        </p>
        {writeAction}
      </div>

      <article className="space-y-10" aria-live="polite">
        {parts.map((part, index) => (
          <section key={index} className="space-y-4">
            <h2 className="text-lg font-semibold tracking-tight">{part.title}</h2>
            <div className="space-y-4">
              {part.blocks.map((block, blockIndex) => (
                <Passage
                  key={blockIndex}
                  block={block}
                  onProvenance={setProvenanceFor}
                  onCorrect={setCorrecting}
                />
              ))}
            </div>
          </section>
        ))}
      </article>

      {provenanceFor && (
        <ProvenanceSheet
          projectId={projectId}
          itemId={provenanceFor}
          revisionId={current.sourceRevisionId}
          open
          onOpenChange={(open) => !open && setProvenanceFor(null)}
        />
      )}
      {correcting && (
        <GuidedCorrectionDialog
          projectId={projectId}
          itemId={correcting}
          currentContent={statementText.get(correcting) ?? ""}
          revisionId={current.sourceRevisionId}
          open
          onOpenChange={(open) => !open && setCorrecting(null)}
        />
      )}
    </div>
  );
}
