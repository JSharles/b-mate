"use client";
import { Check, CircleDashed, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { useCategoryDraft, useCategoryDrafts, useCorrectCategoryDraft, useReviewCategoryDraft } from "../hooks";

export function CategoryReviewList({ projectId }: { projectId: string }) {
  const t = useTranslations("Projects.DocumentationNew.Reviews");
  const list = useCategoryDrafts(projectId);
  const [selected, setSelected] = useState<string | null>(null);
  const detail = useCategoryDraft(projectId, selected);
  const review = useReviewCategoryDraft(projectId);
  const correct = useCorrectCategoryDraft(projectId);
  const [instruction, setInstruction] = useState("");
  const drafts = list.data?.map((state) => state.activeDraft).filter((draft): draft is NonNullable<typeof draft> => Boolean(draft)) ?? [];
  return <section className="border-b border-border py-8" aria-labelledby="category-review-title">
    <div className="mb-4 flex items-center justify-between"><div><h2 id="category-review-title" className="text-xl font-semibold">{t("title")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("description")}</p></div><span className="rounded-full bg-muted px-3 py-1 text-xs">{drafts.length}</span></div>
    {list.isPending ? <p className="text-sm text-muted-foreground"><CircleDashed className="mr-2 inline size-4 animate-spin" />{t("loading")}</p> : drafts.length === 0 ? <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">{t("empty")}</p> : <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      <div className="space-y-2">{drafts.map((draft) => <button key={draft.id} type="button" onClick={() => setSelected(draft.id)} className="w-full rounded-lg border border-border bg-card p-3 text-left hover:border-primary/50"><span className="text-sm font-medium">{t(`category_${draft.categoryKey}`)}</span><span className="mt-1 block text-xs text-muted-foreground">{draft.changeSummary ?? t("generating")}</span></button>)}</div>
      {detail.data ? <div className="rounded-xl border border-border bg-card p-5"><div className="space-y-4">{detail.data.blocks.map((block, index) => <p key={index} className={block.type === "open_point" ? "rounded-md border border-amber-400/30 bg-amber-400/10 p-3" : "leading-7"}>{block.text}</p>)}</div><div className="mt-6 flex flex-wrap gap-2"><Button onClick={() => review.mutate({ draftId: detail.data.id, action: "accept", expectedVersion: detail.data.version })}><Check />{t("accept")}</Button><Button variant="outline" onClick={() => review.mutate({ draftId: detail.data.id, action: "discard", expectedVersion: detail.data.version })}><X />{t("discard")}</Button></div><div className="mt-5 border-t border-border pt-5"><label className="text-sm font-medium" htmlFor="factual-instruction">{t("correctionLabel")}</label><textarea id="factual-instruction" value={instruction} onChange={(event) => setInstruction(event.target.value)} className="mt-2 min-h-24 w-full rounded-lg border border-input bg-background p-3 text-sm" placeholder={t("correctionPlaceholder")} /><Button className="mt-2" variant="secondary" disabled={!instruction.trim()} onClick={() => correct.mutate({ draftId: detail.data.id, expectedVersion: detail.data.version, instruction })}>{t("regenerate")}</Button>{correct.data?.routingCode === "EDITORIAL_INSTRUCTION_REQUIRED" && <p role="status" className="mt-2 text-sm text-amber-300">{t("editorialRedirect")}</p>}</div></div> : <div className="rounded-xl border border-dashed border-border p-8 text-sm text-muted-foreground">{t("select")}</div>}
    </div>}
  </section>;
}
