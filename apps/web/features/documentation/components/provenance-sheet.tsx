"use client";

import { FileText, History, MapPin, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SourceLocator } from "schemas";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useSourceItemProvenance } from "../hooks";

function locatorText(
  locator: SourceLocator | null,
  t: (key: string, values?: Record<string, string | number | Date>) => string,
) {
  if (!locator) return null;
  switch (locator.type) {
    case "pdf_page":
      return t("pdfPage", { page: locator.page });
    case "docx_heading":
      return t("docxHeading", { heading: locator.heading });
    case "image_region":
      return t("imageRegion");
    case "notion_block":
      return t("notionBlock", { position: locator.position + 1 });
  }
}

export function ProvenanceSheet({
  projectId,
  itemId,
  revisionId,
  open,
  onOpenChange,
}: {
  projectId: string;
  itemId: string;
  revisionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Projects.Documentation.Provenance");
  const provenance = useSourceItemProvenance(projectId, itemId, revisionId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader className="border-b border-border pr-12">
          <SheetTitle>{t("title")}</SheetTitle>
          <SheetDescription>{t("description")}</SheetDescription>
        </SheetHeader>
        {provenance.isPending ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : provenance.isError || !provenance.data ? (
          <p role="alert" className="p-4 text-sm text-destructive">{t("loadError")}</p>
        ) : (
          <div className="flex flex-col gap-8 p-4">
            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold">{t("originsTitle")}</h3>
              <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
                {provenance.data.origins.map((origin, index) => {
                  const location = locatorText(origin.locator, t);
                  return (
                    <li key={`${origin.label}-${index}`} className="flex gap-3 p-4">
                      {origin.kind === "document" ? (
                        <FileText className="mt-0.5 size-4 shrink-0 text-primary" />
                      ) : (
                        <UserRound className="mt-0.5 size-4 shrink-0 text-primary" />
                      )}
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{origin.label}</span>
                          <span className="text-xs text-muted-foreground">{t(`role_${origin.role}`)}</span>
                        </div>
                        {location && (
                          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <MapPin className="size-3" />
                            {location}
                          </p>
                        )}
                        {origin.excerpt && (
                          <blockquote className="border-l-2 border-primary/40 pl-3 text-sm leading-relaxed text-muted-foreground">
                            {origin.excerpt}
                          </blockquote>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="flex flex-col gap-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <History className="size-4" />
                {t("historyTitle")}
              </h3>
              <ol className="flex flex-col gap-3 border-l border-border pl-4">
                {provenance.data.history.map((entry) => (
                  <li key={`${entry.revisionId}-${entry.change}`} className="text-sm">
                    <p className="font-medium">{t("revisionLabel", { sequence: entry.revisionSequence })}</p>
                    <p className="text-muted-foreground">{t(`change_${entry.change}`)}</p>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
