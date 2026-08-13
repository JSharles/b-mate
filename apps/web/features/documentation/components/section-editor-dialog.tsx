"use client";

import { ArrowLeft, GitCommitVertical } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { SectionEditorial, SectionKind, SectionView } from "schemas";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { ApiError } from "@/shared/lib/api-client";
import { useCreateSection, useUpdateSection } from "../hooks";
import { SECTION_STARTING_POINTS } from "./section-suggestions";

const DEFAULT_EDITORIAL: SectionEditorial = {
  length: "balanced",
  pedagogy: "guided",
  technicalFamiliarity: "novice",
  tone: "reassuring",
};

const DIMENSIONS = [
  { field: "technicalFamiliarity", options: ["novice", "informed", "technical"] },
  { field: "tone", options: ["reassuring", "neutral", "direct", "formal"] },
  { field: "length", options: ["concise", "balanced", "detailed"] },
  { field: "pedagogy", options: ["direct", "guided", "highly_explanatory"] },
] as const;

const textareaClass =
  "w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function SectionEditorDialog({
  projectId,
  section,
  hasRoadmap = false,
  open,
  onOpenChange,
  onCreated,
}: {
  projectId: string;
  /** Absent when creating. Present when revising an existing section. */
  section?: SectionView;
  /** A project runs one sequence, so it has one frise. Not offered rather than
   *  offered and refused. */
  hasRoadmap?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Told which one was created, so the list can take the contributor to it. */
  onCreated?: (sectionId: string) => void;
}) {
  const t = useTranslations("Projects.Documentation.Sections.Editor");
  const tToasts = useTranslations("Toasts");
  const create = useCreateSection(projectId);
  const update = useUpdateSection(projectId, section?.id ?? "");
  const mutation = section ? update : create;

  const [kind, setKind] = useState<SectionKind>(section?.kind ?? "prose");
  const [name, setName] = useState(section?.name ?? "");
  const [instructions, setInstructions] = useState(section?.instructions ?? "");
  const [editorial, setEditorial] = useState<SectionEditorial>(
    section?.editorial ?? DEFAULT_EDITORIAL,
  );
  // A suggestion is only a way into the form. Once past it every field is
  // ordinary, and nothing remembers which one was picked.
  const [chosenStart, setChosenStart] = useState(Boolean(section));
  const roadmap = kind === "roadmap";

  const error = mutation.error;
  const errorText =
    error instanceof ApiError && error.code === "NO_CANONICAL_CONTENT"
      ? t("noCanonicalContent")
      : error instanceof ApiError && error.code === "SECTION_NAME_TAKEN"
        ? t("nameTaken")
        : error instanceof ApiError && error.code === "SECTION_ROADMAP_EXISTS"
          ? t("roadmapExists")
          : error instanceof ApiError && error.status === 409
            ? t("staleError")
            : error instanceof ApiError
              ? error.message
              : tToasts("genericError");

  // A roadmap has neither a brief nor a register: its brief is fixed, and a
  // milestone date has no tone. So there is nothing left to ask for but a name.
  const canSubmit = Boolean(name.trim()) && (roadmap || Boolean(instructions.trim()));

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setKind(section?.kind ?? "prose");
          setName(section?.name ?? "");
          setInstructions(section?.instructions ?? "");
          setEditorial(section?.editorial ?? DEFAULT_EDITORIAL);
          setChosenStart(Boolean(section));
          mutation.reset();
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{section ? t("editTitle") : t("createTitle")}</DialogTitle>
          <DialogDescription>
            {section ? t("editDescription") : t("createDescription")}
          </DialogDescription>
        </DialogHeader>

        {!chosenStart ? (
          <div className="flex flex-col gap-2">
            {SECTION_STARTING_POINTS.filter(
              (start) => !(start.kind === "roadmap" && hasRoadmap),
            ).map((start) => (
              <button
                key={start.id}
                type="button"
                onClick={() => {
                  setKind(start.kind);
                  setName(t(`suggestion_${start.id}_name`));
                  // A roadmap has no brief to prefill: what it covers is fixed.
                  setInstructions(
                    start.kind === "roadmap"
                      ? ""
                      : t(`suggestion_${start.id}_instructions`),
                  );
                  setChosenStart(true);
                }}
                className="rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  {/* The one card that produces something other than prose says
                      so with the shape it produces, not with a label. */}
                  {start.kind === "roadmap" && (
                    <GitCommitVertical className="size-3.5" />
                  )}
                  {t(`suggestion_${start.id}_name`)}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  {t(
                    start.kind === "roadmap"
                      ? "suggestion_roadmap_summary"
                      : `suggestion_${start.id}_instructions`,
                  )}
                </span>
              </button>
            ))}
            <div className="mt-2 border-t border-border pt-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setChosenStart(true)}
              >
                {t("startBlank")}
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              const body = roadmap
                ? { kind: "roadmap" as const, name: name.trim() }
                : {
                    kind: "prose" as const,
                    name: name.trim(),
                    instructions: instructions.trim(),
                    editorial,
                  };
              if (section) {
                update.mutate(
                  {
                    name: name.trim(),
                    ...(roadmap
                      ? {}
                      : { instructions: instructions.trim(), editorial }),
                    expectedVersion: section.version,
                  },
                  { onSuccess: () => onOpenChange(false) },
                );
              } else {
                create.mutate(body, {
                  onSuccess: (created) => {
                    onOpenChange(false);
                    onCreated?.(created.id);
                  },
                });
              }
            }}
          >
            {!section && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-ml-2 w-fit text-muted-foreground"
                onClick={() => {
                  setKind("prose");
                  setName("");
                  setInstructions("");
                  setChosenStart(false);
                }}
              >
                <ArrowLeft />
                {t("backToSuggestions")}
              </Button>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="section-name">{t("nameLabel")}</Label>
              <input
                id="section-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("nameHint")}
              </p>
            </div>

            {!roadmap && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="section-instructions">
                {t("instructionsLabel")}
              </Label>
              <textarea
                id="section-instructions"
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                rows={4}
                maxLength={4000}
                className={textareaClass}
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("instructionsHint")}
              </p>
            </div>
            )}

            {!roadmap && (
            <div className="grid gap-3 sm:grid-cols-2">
              {DIMENSIONS.map(({ field, options }) => (
                <div key={field} className="flex flex-col gap-2">
                  <Label htmlFor={`section-${field}`}>{t(`${field}Label`)}</Label>
                  <Select
                    value={editorial[field]}
                    onValueChange={(value) =>
                      setEditorial((current) => ({ ...current, [field]: value }))
                    }
                  >
                    <SelectTrigger id={`section-${field}`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((option) => (
                        <SelectItem key={option} value={option}>
                          {t(`${field}_${option}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            )}

            {/* FR-020 made visible: revising what a section covers marks it for
                refresh rather than recomposing behind the contributor's back. */}
            {section && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("refreshNotice")}
              </p>
            )}

            {mutation.isError && (
              <p role="alert" className="text-sm text-destructive">
                {errorText}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={!canSubmit || mutation.isPending}>
                {mutation.isPending
                  ? t("submitting")
                  : section
                    ? t("save")
                    : t("create")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
