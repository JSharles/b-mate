"use client";

import { useLocale, useTranslations } from "next-intl";
import { RESOURCE_CATEGORIES, resourceCategoryLabel } from "schemas";
import type { Resource, ResourceCategoryKey, ResourceSection } from "schemas";
import { Button } from "@/shared/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { cn } from "@/shared/lib/utils";
import {
  useApproveResourceSection,
  useMoveResourceSection,
  useRejectResourceSection,
} from "../hooks";

// specs/014-category-sections US2. What a contributor reviews is no longer a
// *label* — the four categories are fixed, so there is nothing to approve
// about one — but what the analysis decided to file where. Each section is
// decided independently, and none of it touches the resource's own status.
export function SectionReviewList({
  projectId,
  resource,
}: {
  projectId: string;
  resource: Resource;
}) {
  const t = useTranslations("Projects.ResourceDetailPage");
  const approve = useApproveResourceSection(projectId);
  const reject = useRejectResourceSection(projectId);
  const move = useMoveResourceSection(projectId);

  const pending = approve.isPending || reject.isPending || move.isPending;

  if (resource.sections.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("reviewEmpty")}</p>;
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium text-foreground">{t("reviewTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("reviewIntro")}</p>
      </div>
      <ul className="flex flex-col gap-4">
        {resource.sections.map((section) => (
          <SectionReviewItem
            key={section.id}
            resourceId={resource.id}
            section={section}
            pending={pending}
            onApprove={() =>
              approve.mutate({ resourceId: resource.id, sectionId: section.id })
            }
            onReject={() =>
              reject.mutate({ resourceId: resource.id, sectionId: section.id })
            }
            onMove={(categoryKey) =>
              move.mutate({ resourceId: resource.id, sectionId: section.id, categoryKey })
            }
          />
        ))}
      </ul>
    </section>
  );
}

function SectionReviewItem({
  section,
  pending,
  onApprove,
  onReject,
  onMove,
}: {
  resourceId: string;
  section: ResourceSection;
  pending: boolean;
  onApprove: () => void;
  onReject: () => void;
  onMove: (categoryKey: ResourceCategoryKey) => void;
}) {
  const t = useTranslations("Projects.ResourceDetailPage");
  const locale = useLocale();
  const isProposed = section.status === "proposed";

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {resourceCategoryLabel(section.categoryKey, locale)}
        </span>
        {isProposed ? (
          <div className="flex items-center gap-2">
            {/* Re-filing is offered only while the section is still proposed:
                moving it after approval would silently pull it out of a tab
                the client is already reading (research.md Decision 4). */}
            <Select
              value={section.categoryKey}
              onValueChange={(value) => onMove(value as ResourceCategoryKey)}
              disabled={pending}
            >
              <SelectTrigger size="sm" aria-label={t("sectionMoveLabel")} className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESOURCE_CATEGORIES.map((category) => (
                  <SelectItem key={category.key} value={category.key}>
                    {resourceCategoryLabel(category.key, locale)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" size="sm" disabled={pending} onClick={onApprove}>
              {t("sectionApprove")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={pending}
              onClick={onReject}
            >
              {t("sectionReject")}
            </Button>
          </div>
        ) : (
          <span
            className={cn(
              "text-xs tracking-wide uppercase text-muted-foreground",
              section.status === "rejected" && "line-through",
            )}
          >
            {section.status === "approved" ? t("sectionApproved") : t("sectionRejected")}
          </span>
        )}
      </div>
      <h3 className="text-base font-medium text-foreground">{section.title}</h3>
      <p className="max-w-prose leading-relaxed whitespace-pre-line text-foreground/90">
        {section.content}
      </p>
    </li>
  );
}
