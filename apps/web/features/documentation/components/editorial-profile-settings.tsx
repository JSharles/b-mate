"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { EditorialProfileValues } from "schemas";
import { ClientCategoryView } from "@/shared/components/client-category-view";
import { Button } from "@/shared/components/ui/button";
import {
  useCancelEditorialProfile,
  useConfirmEditorialProfile,
  useEditorialProfile,
  useProposeEditorialProfile,
} from "../hooks";

const options = {
  length: ["concise", "balanced", "detailed"],
  pedagogy: ["direct", "guided", "highly_explanatory"],
  technicalFamiliarity: ["novice", "informed", "technical"],
  tone: ["reassuring", "neutral", "direct", "formal"],
} as const;

export function EditorialProfileSettings({ projectId }: { projectId: string }) {
  const t = useTranslations("Projects.DocumentationNew.Editorial");
  const profile = useEditorialProfile(projectId);
  const propose = useProposeEditorialProfile(projectId);
  const confirm = useConfirmEditorialProfile(projectId);
  const cancel = useCancelEditorialProfile(projectId);
  const [edited, setEdited] = useState<EditorialProfileValues | null>(null);

  if (!profile.data) return null;
  const values =
    edited ?? {
      length: profile.data.length,
      pedagogy: profile.data.pedagogy,
      technicalFamiliarity: profile.data.technicalFamiliarity,
      tone: profile.data.tone,
      guidance: profile.data.guidance,
    };
  const proposal = profile.data.proposal;

  function change<K extends keyof EditorialProfileValues>(
    key: K,
    value: EditorialProfileValues[K],
  ) {
    setEdited({ ...values, [key]: value });
  }

  function changeSelect(key: keyof typeof options, value: string) {
    if (key === "length" && options.length.includes(value as EditorialProfileValues["length"])) {
      change(key, value as EditorialProfileValues["length"]);
    } else if (key === "pedagogy" && options.pedagogy.includes(value as EditorialProfileValues["pedagogy"])) {
      change(key, value as EditorialProfileValues["pedagogy"]);
    } else if (key === "technicalFamiliarity" && options.technicalFamiliarity.includes(value as EditorialProfileValues["technicalFamiliarity"])) {
      change(key, value as EditorialProfileValues["technicalFamiliarity"]);
    } else if (key === "tone" && options.tone.includes(value as EditorialProfileValues["tone"])) {
      change(key, value as EditorialProfileValues["tone"]);
    }
  }

  return (
    <section className="border-b border-border py-8">
      <h2 className="text-xl font-semibold">{t("title")}</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        {t("description")}
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(options) as Array<keyof typeof options>).map((key) => (
          <label key={key} className="text-sm font-medium">
            {t(key)}
            <select
              className="mt-2 w-full rounded-md border border-input bg-background p-2"
              value={values[key]}
              onChange={(event) => changeSelect(key, event.target.value)}
            >
              {options[key].map((option) => (
                <option key={option} value={option}>
                  {t(`${key}_${option}`)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <label className="mt-4 block text-sm font-medium">
        {t("guidance")}
        <textarea
          className="mt-2 min-h-20 w-full rounded-md border border-input bg-background p-3"
          value={values.guidance ?? ""}
          onChange={(event) => change("guidance", event.target.value || null)}
        />
      </label>
      <Button
        className="mt-4"
        disabled={propose.isPending || Boolean(proposal)}
        onClick={() =>
          propose.mutate({ expectedVersion: profile.data.version, values })
        }
      >
        {t("preview")}
      </Button>
      {proposal && (
        <div className="mt-6 rounded-xl border border-border bg-card p-5">
          <h3 className="font-semibold">
            {proposal.status === "preview_pending"
              ? t("generating")
              : proposal.status === "saved_without_preview"
                ? t("noContent")
                : t("previewTitle")}
          </h3>
          {proposal.before && proposal.after && (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-xs uppercase text-muted-foreground">
                  {t("before")}
                </p>
                <ClientCategoryView category={proposal.before} />
              </div>
              <div>
                <p className="mb-2 text-xs uppercase text-primary">
                  {t("after")}
                </p>
                <ClientCategoryView category={proposal.after} />
              </div>
            </div>
          )}
          <div className="mt-5 flex gap-2">
            <Button
              disabled={
                !["preview_ready", "saved_without_preview"].includes(
                  proposal.status,
                )
              }
              onClick={() =>
                confirm.mutate({
                  proposalId: proposal.id,
                  expectedVersion: proposal.version,
                })
              }
            >
              {t("confirm")}
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                cancel.mutate({
                  proposalId: proposal.id,
                  expectedVersion: proposal.version,
                })
              }
            >
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
