"use client";

import { useTranslations } from "next-intl";
import { CurrentTaskCard } from "@/features/current-task/components/current-task-card";
import { usePublicClientSections } from "@/features/documentation/hooks";
import { ClientSectionView } from "@/shared/components/client-section-view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { cn } from "@/shared/lib/utils";

const CURRENT_TASK_TAB_KEY = "__current-task__";

// A tab holds one continuous text, not a stack of blocks the reader has to
// reconcile — that was the point of moving the unit off the document (specs/015
// US3), and it survives the move onto sections.
//
// Order and labels now come from the contributor rather than from a frozen
// list: they named these headings and chose the order their client reads them
// in (specs/017). The API already returns them ordered and omits any section
// with nothing to say, which is what produces "no empty tab" (FR-023).
export function ClientMainTabs({
  projectId,
  className,
}: {
  projectId: string;
  className?: string;
}) {
  const { data: sections } = usePublicClientSections(projectId);
  const t = useTranslations("Projects.ClientMainTabs");
  const currentTaskLabel = useTranslations("Projects.CurrentTaskCard")("title");

  return (
    <Tabs
      defaultValue={CURRENT_TASK_TAB_KEY}
      className={cn("min-h-0", className)}
      aria-label={t("tabsLabel")}
    >
      <TabsList className="w-fit shrink-0">
        <TabsTrigger value={CURRENT_TASK_TAB_KEY}>{currentTaskLabel}</TabsTrigger>
        {(sections ?? []).map((section) => (
          <TabsTrigger key={section.id} value={section.id}>
            {section.name}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value={CURRENT_TASK_TAB_KEY} className="min-h-0">
        <CurrentTaskCard projectId={projectId} />
      </TabsContent>
      {(sections ?? []).map((section) => (
        <TabsContent
          key={section.id}
          value={section.id}
          className="min-h-0 overflow-y-auto"
        >
          <ClientSectionView section={section} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
