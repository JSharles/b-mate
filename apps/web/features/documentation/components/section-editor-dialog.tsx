"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { SectionEditorial, SectionView } from "schemas";
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
import { SECTION_SUGGESTION_IDS } from "./section-suggestions";

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
  open,
  onOpenChange,
}: {
  projectId: string;
  /** Absent when creating. Present when revising an existing section. */
  section?: SectionView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Projects.Documentation.Sections.Editor");
  const tToasts = useTranslations("Toasts");
  const create = useCreateSection(projectId);
  const update = useUpdateSection(projectId, section?.id ?? "");
  const mutation = section ? update : create;

  const [name, setName] = useState(section?.name ?? "");
  const [instructions, setInstructions] = useState(section?.instructions ?? "");
  const [editorial, setEditorial] = useState<SectionEditorial>(
    section?.editorial ?? DEFAULT_EDITORIAL,
  );
  // A suggestion is only a way into the form. Once past it every field is
  // ordinary, and nothing remembers which one was picked.
  const [chosenStart, setChosenStart] = useState(Boolean(section));

  const error = mutation.error;
  const errorText =
    error instanceof ApiError && error.status === 400
      ? t("noCanonicalContent")
      : error instanceof ApiError && error.status === 409
        ? t("staleError")
        : error instanceof ApiError
          ? error.message
          : tToasts("genericError");

  const canSubmit = Boolean(name.trim() && instructions.trim());

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
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
            {SECTION_SUGGESTION_IDS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setName(t(`suggestion_${id}_name`));
                  setInstructions(t(`suggestion_${id}_instructions`));
                  setChosenStart(true);
                }}
                className="rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="block text-sm font-medium">
                  {t(`suggestion_${id}_name`)}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  {t(`suggestion_${id}_instructions`)}
                </span>
              </button>
            ))}
            <Button
              type="button"
              variant="ghost"
              className="self-start"
              onClick={() => setChosenStart(true)}
            >
              {t("startBlank")}
            </Button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              const body = {
                name: name.trim(),
                instructions: instructions.trim(),
                editorial,
              };
              if (section) {
                update.mutate(
                  { ...body, expectedVersion: section.version },
                  { onSuccess: () => onOpenChange(false) },
                );
              } else {
                create.mutate(body, { onSuccess: () => onOpenChange(false) });
              }
            }}
          >
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
                    <SelectTrigger id={`section-${field}`}>
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
