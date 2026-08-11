"use client";
import { AlertCircle, Eye, LockKeyhole } from "lucide-react";
import { useTranslations } from "next-intl";
import { ClientCategoryView } from "@/shared/components/client-category-view";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useClientContentPreview } from "../hooks";

// This section answers the only question a contributor arrives with — what
// does my client actually see — and it is deliberately last so the page closes
// on it. Returning null while loading or on error defeated that: the page
// ended on the editorial dropdowns instead, and a failed fetch read as
// "nothing is published", which is a different and wrong fact.
function Frame({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Projects.DocumentationNew.Preview");
  return (
    <section className="border-b border-border py-8">
      <div className="mb-4 flex items-center gap-3">
        <Eye className="size-5 text-primary" />
        <h2 className="text-lg font-semibold">{t("title")}</h2>
      </div>
      {children}
    </section>
  );
}

export function ClientContentPreview({ projectId }: { projectId: string }) {
  const t = useTranslations("Projects.DocumentationNew.Preview");
  const preview = useClientContentPreview(projectId);

  if (preview.isPending) {
    return (
      <Frame>
        <Skeleton className="h-32 w-full" />
      </Frame>
    );
  }

  if (preview.isError || !preview.data) {
    return (
      <Frame>
        <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-6">
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="size-4" />
            {t("loadError")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void preview.refetch()}
          >
            {t("retry")}
          </Button>
        </div>
      </Frame>
    );
  }

  return (
    <section className="border-b border-border py-8">
      <div className="mb-4 flex items-center gap-3">
        <Eye className="size-5 text-primary" />
        <div>
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">
            {preview.data.pending ? t("previousVisible") : t("exactVisible")}
          </p>
        </div>
      </div>
      {preview.data.current.categories.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          <LockKeyhole className="mb-2 size-5" aria-hidden />
          {t("empty")}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {preview.data.current.categories.map((category) => (
            <article
              key={category.categoryKey}
              className="rounded-xl border border-border bg-card p-5"
            >
              <h3 className="mb-4 font-semibold">
                {t(`category_${category.categoryKey}`)}
              </h3>
              <ClientCategoryView category={category} />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
