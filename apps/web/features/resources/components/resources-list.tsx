"use client";

import { FolderOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useResources } from "../hooks";
import { AddResourceDialog } from "./add-resource-dialog";
import { ResourceTile } from "./resource-tile";

// specs/011-project-resources: replaces the old "Documentation" ComingSoonCard
// on the developer view (spec.md "Supersedes"). Contributor-only, flat list —
// the category-tabbed reading view a client sees now lives in the page-level
// ClientMainTabs component instead (2026-08-09 redesign folded Resources +
// Current Task into one containerless tabbed area on the client branch); this
// component keeps the unchanged flat list per specs/013-ai-resource-categorization
// FR-006, which already reserved category grouping for clients only.
//
// 2026-08-09: dropped the Card wrapper — one more borderless section in the
// developer project page's classic-settings-page layout (see SettingsRow's
// siblings above/below it), not its own boxed dashboard tile. Kept as its
// own component (not SettingsRow) since the list body below the header row
// needs more structure than a simple label+control row provides.
export function ResourcesList({ projectId }: { projectId: string }) {
  const { data: resources, isPending } = useResources(projectId);
  const [addOpen, setAddOpen] = useState(false);
  const t = useTranslations("Projects.ResourcesList");

  return (
    <div className="flex flex-col gap-3 border-b border-border py-4 last:border-b-0">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium text-foreground">{t("title")}</span>
        <Button type="button" size="sm" onClick={() => setAddOpen(true)}>
          {t("add")}
        </Button>
      </div>
      {isPending ? (
        <Skeleton className="h-20 w-full" />
      ) : !resources || resources.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <FolderOpen className="size-4 shrink-0" />
          {t("empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {resources.map((resource) => (
            <ResourceTile key={resource.id} projectId={projectId} resource={resource} />
          ))}
        </ul>
      )}

      <AddResourceDialog projectId={projectId} open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
