"use client";

import { useState } from "react";
import {
  FileWarning,
  LoaderCircle,
  MessageSquarePlus,
  Printer,
  RefreshCw,
  SearchX,
  TriangleAlert,
  X,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { Note, ReferenceBlock, ReferencePart, ReferencePoint } from "schemas";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import {
  useAddNote,
  useNotes,
  useReferenceDocument,
  useReferenceSummary,
  useRemoveNote,
  useWriteReferenceDocument,
} from "../hooks";

// The one way to tell Diaphane something. Answering an open point and
// correcting a paragraph are the same act, so they are the same component:
// what was on screen travels with the note as its context (specs/018, FR-012).
function NoteComposer({
  projectId,
  context,
  label,
  quiet,
}: {
  projectId: string;
  context: string;
  label: string;
  quiet?: boolean;
}) {
  const t = useTranslations("Projects.Documentation.Reference");
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const add = useAddNote(projectId);

  if (!open) {
    return (
      <div
        className={
          quiet
            ? // Sits in the gap between two paragraphs rather than adding to
              // it: in flow, an invisible control still reserved its height and
              // pushed the paragraphs 55px apart where the rhythm called for 20.
              "absolute -bottom-2 right-0 opacity-0 transition-opacity focus-within:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 print:hidden"
            : "print:hidden"
        }
      >
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => setOpen(true)}
        >
          <MessageSquarePlus />
          {label}
        </Button>
      </div>
    );
  }

  const submit = () => {
    add.mutate(
      { content: content.trim(), context },
      {
        onSuccess: () => {
          setContent("");
          setOpen(false);
        },
      },
    );
  };

  return (
    <div className="space-y-2 print:hidden">
      <textarea
        aria-label={label}
        autoFocus
        rows={3}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        className="w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!content.trim() || add.isPending}
          onClick={submit}
        >
          {add.isPending && (
            <LoaderCircle className="animate-spin motion-reduce:animate-none" />
          )}
          {t("saveNote")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setOpen(false)}
        >
          {t("cancel")}
        </Button>
      </div>
      {add.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t("noteError")}
        </p>
      )}
    </div>
  );
}

// A passage, set as continuous text. Its correction takes no layout at rest —
// the whole reason the old list was unreadable was that every sentence carried
// a label, two buttons and a rule.
function Passage({
  projectId,
  block,
  point,
}: {
  projectId: string;
  block: ReferenceBlock;
  point?: ReferencePoint;
}) {
  const t = useTranslations("Projects.Documentation.Reference");

  // FR-016: what the documents never settled is marked where it applies, and
  // answered there. There is no second list of the same questions elsewhere.
  if (block.kind === "gap") {
    return (
      <div className="space-y-3 rounded-lg border border-border bg-muted/40 px-5 py-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {t("openPoint")}
        </p>
        <p className="text-base leading-[1.75]">{block.text}</p>
        {point && (
          <div className="space-y-1">
            <p className="text-sm font-medium leading-relaxed">
              {point.question}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {point.why}
            </p>
          </div>
        )}
        <NoteComposer
          projectId={projectId}
          context={point?.question ?? block.text}
          label={t("answer")}
        />
      </div>
    );
  }

  return (
    <div className="group relative">
      <p className="text-base leading-[1.75]">{block.text}</p>
      <NoteComposer
        projectId={projectId}
        context={block.text}
        label={t("correct")}
        quiet
      />
    </div>
  );
}

// Everything the developer has told Diaphane, kept in one place because every
// write starts from the original documents again: a note that stopped being
// replayed would silently un-answer a question they already answered.
function NoteList({ projectId, items }: { projectId: string; items: Note[] }) {
  const t = useTranslations("Projects.Documentation.Reference");
  const format = useFormatter();
  const remove = useRemoveNote(projectId);

  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby="notes-title"
      className="border-t border-border pt-7 print:hidden"
    >
      <h2 id="notes-title" className="text-lg font-semibold tracking-tight">
        {t("notesTitle")}
      </h2>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {t("notesHint")}
      </p>
      <ul className="mt-4 space-y-3">
        {items.map((note) => (
          <li
            key={note.id}
            className="flex items-start gap-3 rounded-lg border border-border bg-card p-4"
          >
            <div className="min-w-0 flex-1">
              {note.context && (
                <p className="truncate text-xs text-muted-foreground">
                  {note.context}
                </p>
              )}
              <p className="mt-1 text-sm leading-relaxed">{note.content}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("notedBy", {
                  name: note.authorName,
                  date: format.dateTime(new Date(note.createdAt), {
                    dateStyle: "medium",
                  }),
                })}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("removeNote")}
              disabled={remove.isPending}
              onClick={() => remove.mutate(note.id)}
            >
              <X />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ReferenceDocumentView({ projectId }: { projectId: string }) {
  const t = useTranslations("Projects.Documentation.Reference");
  const documentQuery = useReferenceDocument(projectId);
  const summary = useReferenceSummary(projectId);
  const notes = useNotes(projectId);
  const write = useWriteReferenceDocument(projectId);

  const current = documentQuery.data;
  const pendingNotes: Note[] = notes.data?.notes ?? [];
  const documentCount = summary.data?.documentCount ?? 0;

  if (documentQuery.isPending) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label={t("loading")}>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  // A failed request is not a project without a document.
  if (documentQuery.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {t("loadError")}
      </p>
    );
  }

  // Adding a document writes the document on its own; this button exists for
  // the other half of the rule — the answers and corrections the developer
  // accumulates, which wait so that five of them cost one write rather than
  // five, and so the document does not move while it is being read.
  const writeAction = (
    <Button
      type="button"
      variant={pendingNotes.length > 0 ? "default" : "outline"}
      onClick={() => write.mutate()}
      disabled={write.isPending}
    >
      {write.isPending ? (
        <LoaderCircle className="animate-spin motion-reduce:animate-none" />
      ) : (
        <RefreshCw />
      )}
      {pendingNotes.length > 0
        ? t("applyNotes", { count: pendingNotes.length })
        : current
          ? t("rewrite")
          : t("write")}
    </Button>
  );

  // Adding a document starts the write, so a project holding documents and no
  // reference document is one where that write never happened — it failed, or
  // the documents predate it. Offering nothing here left the only way forward
  // behind a document upload the developer had no reason to make.
  if (!current) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6">
        <p className="text-sm text-muted-foreground">
          {documentCount > 0
            ? t("notWrittenYet", { count: documentCount })
            : t("neverWritten")}
        </p>
        {documentCount > 0 && <div className="mt-4">{writeAction}</div>}
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
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
          <SearchX className="mt-0.5 size-4 shrink-0" />
          <p>{t("nothingUsable")}</p>
        </div>
        <div className="print:hidden">{writeAction}</div>
      </div>
    );
  }

  const parts = current.parts as ReferencePart[];
  const pointsById = new Map(current.points.map((point) => [point.id, point]));
  // Under every heading, the same list of document names is furniture. It only
  // tells the developer anything when the parts drew on different documents.
  const provenanceVaries =
    new Set(parts.map((part) => part.documentTitles.join("|"))).size > 1;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {t("writtenFrom", { count: parts.length })}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {/* The browser's own print dialog is the download: it saves to PDF on
              every platform, and the page already prints as the document alone
              rather than as the screen around it. */}
          <Button type="button" variant="outline" onClick={() => window.print()}>
            <Printer />
            {t("download")}
          </Button>
          {writeAction}
        </div>
      </div>

      {/* FR-017: an upload mistake is named. Silently ignoring the document
          would leave the developer waiting for it to show up. */}
      {current.unrelatedDocuments.length > 0 && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4 print:hidden"
        >
          <FileWarning className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm">
              {t("unrelated", { count: current.unrelatedDocuments.length })}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {current.unrelatedDocuments.join(", ")}
            </p>
          </div>
        </div>
      )}

      {/* Set to a reading measure, not to the container. Everything else on
          this page is a control; this is the one thing anyone reads end to
          end. */}
      <article className="max-w-[68ch] space-y-12" aria-live="polite">
        {parts.map((part, index) => (
          <section key={index} className="space-y-5">
            <div>
              <h3 className="text-lg font-semibold tracking-tight">
                {part.title}
              </h3>
              {/* FR-004: which documents this part drew on. Coarser than the
                  per-sentence provenance it replaces, and honest about it —
                  and only worth saying when the parts differ, otherwise it is
                  the same line repeated under every heading. */}
              {part.documentTitles.length > 0 && provenanceVaries && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {t("drawnFrom", { documents: part.documentTitles.join(", ") })}
                </p>
              )}
            </div>
            <div className="space-y-5">
              {part.blocks.map((block, blockIndex) => (
                <Passage
                  key={blockIndex}
                  projectId={projectId}
                  block={block}
                  point={
                    block.pointId
                      ? pointsById.get(block.pointId)
                      : undefined
                  }
                />
              ))}
            </div>
          </section>
        ))}
      </article>

      <NoteList projectId={projectId} items={pendingNotes} />
    </div>
  );
}
