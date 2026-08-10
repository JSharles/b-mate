"use client";

import { useLocale, useTranslations } from "next-intl";
import { RESOURCE_CATEGORIES, resourceCategoryLabel } from "schemas";
import type { CategoryContent } from "schemas";
import { CurrentTaskCard } from "@/features/current-task/components/current-task-card";
import { useCategoryContent } from "@/features/resources/hooks";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { cn } from "@/shared/lib/utils";

const CURRENT_TASK_TAB_KEY = "__current-task__";

// specs/015 US3. A category tab holds one continuous text — not a stack of
// blocks the reader has to reconcile. That is the whole point of moving the
// unit from the document to the category: 014 showed a client several
// overlapping bodies about the same subject and left them to sort it out.
//
// Tab order follows the frozen category list rather than arrival order, so
// tabs never reshuffle as content accumulates, and `other` is always last.
// A category with no content is simply absent from the response, which is
// what produces "no empty tab" (FR-012).
function orderByFrozenList(content: CategoryContent[]): CategoryContent[] {
  const byKey = new Map(content.map((entry) => [entry.categoryKey, entry]));

  return RESOURCE_CATEGORIES.flatMap((category) => {
    const entry = byKey.get(category.key);
    return entry ? [entry] : [];
  });
}

// The client-facing "what's happening on this project" area: one containerless
// Tabs surface, Current Task first and open by default, then one tab per
// category that has something to say. No overarching title — the tabs are
// self-labeling, and a generic label like "Documents" would misdescribe both a
// non-document tab like Current Task and content that is no longer organised
// by document at all. Composes features/current-task and features/resources,
// so per Constitution III it cannot live inside either feature folder.
export function ClientMainTabs({
  projectId,
  className,
}: {
  projectId: string;
  className?: string;
}) {
  const { data: content } = useCategoryContent(projectId);
  const locale = useLocale();
  const t = useTranslations("Projects.ClientMainTabs");
  const currentTaskLabel = useTranslations("Projects.CurrentTaskCard")("title");

  const categories = content ? orderByFrozenList(content) : [];

  return (
    <Tabs
      defaultValue={CURRENT_TASK_TAB_KEY}
      className={cn("min-h-0", className)}
      aria-label={t("tabsLabel")}
    >
      <TabsList className="w-fit shrink-0">
        <TabsTrigger value={CURRENT_TASK_TAB_KEY}>{currentTaskLabel}</TabsTrigger>
        {categories.map((category) => (
          <TabsTrigger key={category.categoryKey} value={category.categoryKey}>
            {resourceCategoryLabel(category.categoryKey, locale)}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value={CURRENT_TASK_TAB_KEY} className="min-h-0">
        <CurrentTaskCard projectId={projectId} />
      </TabsContent>
      {categories.map((category) => (
        <TabsContent
          key={category.categoryKey}
          value={category.categoryKey}
          className="min-h-0 overflow-y-auto"
        >
          <p className="max-w-prose leading-relaxed whitespace-pre-line text-foreground/90">
            {category.content}
          </p>
        </TabsContent>
      ))}
    </Tabs>
  );
}
