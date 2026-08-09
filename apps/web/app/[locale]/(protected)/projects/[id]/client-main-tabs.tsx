"use client";

import { useTranslations } from "next-intl";
import type { Resource } from "schemas";
import { CurrentTaskCard } from "@/features/current-task/components/current-task-card";
import { ResourceTile } from "@/features/resources/components/resource-tile";
import { useResources } from "@/features/resources/hooks";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { cn } from "@/shared/lib/utils";

const UNCATEGORIZED_TAB_KEY = "__uncategorized__";
const CURRENT_TASK_TAB_KEY = "__current-task__";

interface CategoryGroup {
  key: string;
  label: string;
  resources: Resource[];
}

// Moved here from resources-list.tsx (2026-08-09 redesign) — this grouping
// is now exclusively a client-facing reading concern, so it lives with the
// client-only tabs rather than in the (now dev-only, flat-list)
// ResourcesList. specs/013-ai-resource-categorization FR-005/FR-009: a
// resource with several approved categories appears under each of its
// tabs — a genuine many-to-many grouping, not a partition. Tabs only
// replace the flat list once at least one real category exists; a project
// where every resource is still uncategorized just doesn't add extra tabs
// beyond Current Task.
function groupByCategory(resources: Resource[], uncategorizedLabel: string): CategoryGroup[] {
  const groups = new Map<string, CategoryGroup>();
  const uncategorized: Resource[] = [];

  for (const resource of resources) {
    const approved = resource.categories.filter((category) => category.status === "approved");
    if (approved.length === 0) {
      uncategorized.push(resource);
      continue;
    }
    for (const category of approved) {
      const group = groups.get(category.key);
      if (group) {
        group.resources.push(resource);
      } else {
        groups.set(category.key, { key: category.key, label: category.label, resources: [resource] });
      }
    }
  }

  const categoryGroups = Array.from(groups.values());
  if (categoryGroups.length === 0) {
    return [];
  }
  if (uncategorized.length > 0) {
    categoryGroups.push({
      key: UNCATEGORIZED_TAB_KEY,
      label: uncategorizedLabel,
      resources: uncategorized,
    });
  }
  return categoryGroups;
}

// The client-facing "what's happening on this project" area, replacing the
// old separate Current-Task hero + Resources card (2026-08-09 redesign):
// one containerless Tabs surface, Current Task first and open by default,
// AI-detected document categories after it (a Roadmap document, once a
// developer writes/uploads one, just resurfaces here as its own category —
// it isn't a separate feature). No overarching title: the tabs are
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
  const t = useTranslations("Projects.ClientMainTabs");
  const currentTaskLabel = useTranslations("Projects.CurrentTaskCard")("title");

  const categoryGroups = resources ? groupByCategory(resources, t("uncategorized")) : [];

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
          <ul className="flex flex-col gap-2">
            {group.resources.map((resource) => (
              <ResourceTile key={resource.id} projectId={projectId} resource={resource} />
            ))}
          </ul>
        </TabsContent>
      ))}
    </Tabs>
  );
}
