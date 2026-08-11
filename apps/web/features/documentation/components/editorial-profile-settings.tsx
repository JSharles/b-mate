"use client";

import { AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { EditorialProfileValues } from "schemas";
import { ClientCategoryView } from "@/shared/components/client-category-view";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { ApiError } from "@/shared/lib/api-client";
import {
  useCancelEditorialProfile,
  useConfirmEditorialProfile,
  useEditorialProfile,
  useProposeEditorialProfile,
} from "../hooks";

// These mutations suppress the global toast, so without this a rejected write
// is indistinguishable from a dead button — and a version conflict is routine
// here, because the workspace polls while the contributor is deciding.
function ActionError({ error }: { error: unknown }) {
  const t = useTranslations("Projects.DocumentationNew.Editorial");
  if (!error) return null;
  const isStale = error instanceof ApiError && error.status === 409;
  return (
    <p role="alert" className="mt-3 text-sm text-destructive">
      {t(isStale ? "staleError" : "error")}
    </p>
  );
}

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

  // Same reasoning as the client preview: a nav chip points here, so returning
  // nothing on load or error scrolls the contributor to an empty page region.
  if (profile.isPending) {
    return (
      <section className="border-b border-border py-8">
        <h2 className="text-xl font-semibold">{t("title")}</h2>
        <Skeleton className="mt-4 h-24 w-full" />
      </section>
    );
  }
  if (profile.isError || !profile.data) {
    return (
      <section className="border-b border-border py-8">
        <h2 className="text-xl font-semibold">{t("title")}</h2>
        <div className="mt-4 flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-6">
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="size-4" />
            {t("loadError")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void profile.refetch()}
          >
            {t("retry")}
          </Button>
        </div>
      </section>
    );
  }
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
      <ActionError error={propose.error} />
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
                confirm.isPending ||
                cancel.isPending ||
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
              disabled={confirm.isPending || cancel.isPending}
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
          <ActionError error={confirm.error ?? cancel.error} />
        </div>
      )}
    </section>
  );
}
