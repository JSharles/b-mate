"use client";

import { useLocale, useTranslations } from "next-intl";
import { RESOURCE_CATEGORIES, resourceCategoryLabel } from "schemas";
import type { Resource } from "schemas";
import { CurrentTaskCard } from "@/features/current-task/components/current-task-card";
import {
  CategorySectionAccordion,
  type CategorySectionEntry,
} from "@/features/resources/components/category-section-accordion";
import { useResources } from "@/features/resources/hooks";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { cn } from "@/shared/lib/utils";

const CURRENT_TASK_TAB_KEY = "__current-task__";

interface CategoryGroup {
  key: string;
  label: string;
  entries: CategorySectionEntry[];
}

// specs/014-category-sections FR-018/FR-022. Groups *sections*, not resources
// — which is the whole fix. 013 grouped whole documents by the categories
// they had been labelled with, so a document appeared identically under each
// of its tabs and every tab ended up showing the same thing. A section is a
// different rewrite per category, so two tabs drawing from the same source
// document now show genuinely different text (SC-001).
//
// Tab order follows the frozen category list rather than arrival order, so
// tabs never reshuffle as content accumulates, and `other` is always last. A
// category with no section produces no tab at all (SC-007) — there is no
// "uncategorized" tab any more, because `other` is a real category the
// analysis files into deliberately.
function groupSectionsByCategory(resources: Resource[], locale: string): CategoryGroup[] {
  const entriesByCategory = new Map<string, CategorySectionEntry[]>();

  for (const resource of resources) {
    for (const section of resource.sections) {
      const existing = entriesByCategory.get(section.categoryKey);
      if (existing) {
        existing.push({ section, resource });
      } else {
        entriesByCategory.set(section.categoryKey, [{ section, resource }]);
      }
    }
  }

  return RESOURCE_CATEGORIES.flatMap((category) => {
    const entries = entriesByCategory.get(category.key);
    if (!entries || entries.length === 0) {
      return [];
    }
    return [
      {
        key: category.key,
        label: resourceCategoryLabel(category.key, locale),
        entries,
      },
    ];
  });
}

// The client-facing "what's happening on this project" area: one containerless
// Tabs surface, Current Task first and open by default, then one tab per
// category that actually has content. No overarching title — the tabs are
// self-labeling, and a generic label like "Documents" would misdescribe a
// non-document tab like Current Task. Composes features/current-task and
// features/resources, so per Constitution III (feature isolation) it can't
// live inside either feature folder — colocated with the page instead.
export function ClientMainTabs({
  projectId,
  className,
}: {
  projectId: string;
  className?: string;
}) {
  const { data: resources } = useResources(projectId);
  const locale = useLocale();
  const t = useTranslations("Projects.ClientMainTabs");
  const currentTaskLabel = useTranslations("Projects.CurrentTaskCard")("title");

  const categoryGroups = resources ? groupSectionsByCategory(resources, locale) : [];

  return (
    <Tabs
      defaultValue={CURRENT_TASK_TAB_KEY}
      className={cn("min-h-0", className)}
      aria-label={t("tabsLabel")}
    >
      <TabsList className="w-fit shrink-0">
        <TabsTrigger value={CURRENT_TASK_TAB_KEY}>{currentTaskLabel}</TabsTrigger>
        {categoryGroups.map((group) => (
          <TabsTrigger key={group.key} value={group.key}>
            {group.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value={CURRENT_TASK_TAB_KEY} className="min-h-0">
        <CurrentTaskCard projectId={projectId} />
      </TabsContent>
      {categoryGroups.map((group) => (
        <TabsContent key={group.key} value={group.key} className="min-h-0 overflow-y-auto">
          <CategorySectionAccordion entries={group.entries} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
