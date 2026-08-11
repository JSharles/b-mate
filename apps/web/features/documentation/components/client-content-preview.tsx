"use client";
import { Eye, LockKeyhole } from "lucide-react";
import { useTranslations } from "next-intl";
import { ClientCategoryView } from "@/shared/components/client-category-view";
import { useClientContentPreview } from "../hooks";
export function ClientContentPreview({ projectId }: { projectId: string }) {
  const t = useTranslations("Projects.DocumentationNew.Preview"); const preview = useClientContentPreview(projectId);
  if (!preview.data) return null;
  return <section className="border-b border-border py-8"><div className="mb-4 flex items-center gap-3"><Eye className="size-5 text-primary"/><div><h2 className="text-xl font-semibold">{t("title")}</h2><p className="text-sm text-muted-foreground">{preview.data.pending ? t("previousVisible") : t("exactVisible")}</p></div></div>{preview.data.current.categories.length === 0 ? <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground"><LockKeyhole className="mb-2 size-5" />{t("empty")}</div> : <div className="grid gap-4 md:grid-cols-2">{preview.data.current.categories.map((category) => <article key={category.categoryKey} className="rounded-xl border border-border bg-card p-5"><h3 className="mb-4 font-semibold">{t(`category_${category.categoryKey}`)}</h3><ClientCategoryView category={category}/></article>)}</div>}</section>;
}
