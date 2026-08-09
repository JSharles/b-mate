"use client";

import { Download, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Resource, ResourceSection } from "schemas";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/shared/components/ui/accordion";

export interface CategorySectionEntry {
  section: ResourceSection;
  resource: Resource;
}

// specs/014-category-sections US3/FR-019. The client reads here — there is no
// click-through to a detail page any more. The first section of a tab is
// expanded on arrival so something substantive is readable with zero
// interaction (SC-002); the rest are titles until asked for.
export function CategorySectionAccordion({ entries }: { entries: CategorySectionEntry[] }) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <Accordion
      type="single"
      collapsible
      defaultValue={entries[0].section.id}
      className="w-full"
    >
      {entries.map(({ section, resource }) => (
        <AccordionItem key={section.id} value={section.id}>
          <AccordionTrigger className="text-left text-base font-medium">
            {section.title}
          </AccordionTrigger>
          <AccordionContent className="flex flex-col gap-4">
            <p className="max-w-prose leading-relaxed whitespace-pre-line text-foreground/90">
              {section.content}
            </p>
            {/* FR-020: the section is a rewrite, so the source document stays
                one click away for anyone who wants to check it. */}
            <SourceDocumentLink resource={resource} />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

function SourceDocumentLink({ resource }: { resource: Resource }) {
  const t = useTranslations("Projects.ResourceDetailPage");

  if (resource.source === "notion") {
    if (!resource.notionPageUrl) return null;
    return (
      <a
        href={resource.notionPageUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <ExternalLink className="size-4" />
        {t("viewOnNotion")}
      </a>
    );
  }

  if (!resource.originalFileUrl) return null;

  return (
    <a
      href={resource.originalFileUrl}
      download={resource.originalFileName ?? undefined}
      className="inline-flex w-fit items-center gap-1.5 text-sm text-primary hover:underline"
    >
      <Download className="size-4" />
      {t("downloadOriginal")}
    </a>
  );
}
