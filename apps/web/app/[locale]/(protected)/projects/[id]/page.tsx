"use client";

import { TriangleAlert, Video } from "lucide-react";
import { useTranslations } from "next-intl";
import { Suspense, use } from "react";
import { BoardConnectionCard } from "@/features/board-connections/components/board-connection-card";
import { NotionConnectionCard } from "@/features/notion-connection/components/notion-connection-card";
import { MeetingCard } from "@/features/projects/components/meeting-card";
import { MeetingLinkCard } from "@/features/projects/components/meeting-link-card";
import { ProjectPreferences } from "@/features/projects/components/project-preferences";
import { TeamPanel } from "@/features/projects/components/team-panel";
import { TeamSummaryCard } from "@/features/projects/components/team-summary-card";
import { ResourcesList } from "@/features/resources/components/resources-list";
import { useProject } from "@/features/projects/hooks";
import { Button } from "@/shared/components/ui/button";
import { SettingsSectionHeading } from "@/shared/components/settings-section-heading";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";
import { ClientMainTabs } from "./client-main-tabs";

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: project, isPending, isError, refetch } = useProject(id);
  const t = useTranslations("Projects.ProjectPage");

  if (isPending) {
    return <Skeleton className="h-8 w-64" />;
  }

  // A failed refetch keeps the previous `data` around by default (React
  // Query) — checking isError here (rather than only `!project`) stops a
  // stale project from a prior session in this tab (e.g. after logout/login
  // as someone else) from rendering, including admin-only cartouches, even
  // once the fresh fetch is rejected. An explicit retry beats a silent blank
  // page (critique P2) — this IS the transparency the product sells.
  if (isError || !project) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <TriangleAlert className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t("loadErrorTitle")}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
          {t("loadErrorRetry")}
        </Button>
      </div>
    );
  }

  const isContributor = project.role === "contributor";

  return (
    // h-full only for the client branch, which needs it: ClientMainTabs'
    // row below uses lg:flex-1 to fill the rest of the viewport, which only
    // works if this ancestor actually has a definite height to grow into.
    // The contributor branch is a plain top-to-bottom scrolling settings
    // page now — forcing it into the same fixed viewport height served no
    // purpose and left every section fighting for a fixed height it didn't
    // need (the actual cause of Team's content getting squeezed/clipped).
    <div className={cn("flex w-full flex-col gap-6", !isContributor && "h-full")}>
      <div className="flex shrink-0 items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{project.title}</h1>
        {/* A prominent shortcut alongside the settings-row link inside
            MeetingLinkCard/MeetingCard further down — this one is for
            "I need to get into the call right now", not for managing the
            link itself. Shown to both roles: a client needs this at least
            as much as the developer does. */}
        {project.meetingUrl && (
          <Button asChild size="sm">
            <a href={project.meetingUrl} target="_blank" rel="noreferrer">
              <Video className="size-4" />
              {t("joinMeeting")}
            </a>
          </Button>
        )}
      </div>

      {isContributor ? (
        // Redesigned 2026-08-09, third pass: reordered to match actual
        // usage frequency rather than the old grouping-by-origin (Team +
        // connections summary in a sidebar, Resources as "main content" —
        // a layout artifact of the old bento, not a deliberate priority
        // order). Resources first (the thing a developer is actually in
        // day to day), then Team (who has access), then Tools — Board and
        // Notion grouped under one heading, since both are the same kind
        // of thing (a third-party connection configured once and rarely
        // revisited) rather than two unrelated top-level sections — then
        // Meetings, then Preferences (Timezone/Date format/Language) last,
        // as the most rarely touched. No gap-* on the column: each row
        // supplies its own vertical rhythm via padding + border-b, so an
        // extra gap between them would just double up the spacing.
        <div className="flex flex-col">
          <ResourcesList projectId={id} />
          <TeamSummaryCard projectId={id} isAdmin={project.isAdmin} />

          <SettingsSectionHeading>{t("tools")}</SettingsSectionHeading>
          {/* Suspense: BoardConnectionCard reads useSearchParams (the
              `connectBoard` param set by the GitHub OAuth callback
              redirect), which Next.js requires to be boundary-wrapped. */}
          <Suspense fallback={<Skeleton className="h-14 w-full" />}>
            <BoardConnectionCard projectId={id} />
          </Suspense>
          <NotionConnectionCard projectId={id} />

          <MeetingLinkCard projectId={id} />

          <SettingsSectionHeading>{t("preferences")}</SettingsSectionHeading>
          <ProjectPreferences projectId={id} />
        </div>
      ) : (
        // Redesigned 2026-08-09, second pass (previous version reported:
        // Resources buried in a nested 1fr sub-cell, squeezed illegible on
        // a shorter viewport, and outranked in visual weight by two
        // "coming soon" placeholders with zero real content). That first
        // redesign fixed the squeeze but still framed Resources as a
        // secondary card next to Current Task's hero — user feedback: with
        // real content to show, the Bento-of-small-cards shape itself was
        // wrong, not just its proportions. Current Task and the AI-detected
        // document categories (Roadmap resurfaces here too, once a
        // developer writes/uploads one — it isn't a separate feature
        // anymore) now live together as tabs in one containerless,
        // full-height surface — Current Task first and open by default, so
        // it keeps the positional weight its Signature Card treatment
        // earns. Developer + Team + the Meetings placeholder move into a
        // narrow sidebar (self-start: it must not stretch to match the
        // tabs column's full height).
        <div className="grid min-h-0 grid-cols-1 gap-4 lg:flex-1 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:self-start">
            <TeamPanel projectId={id} isAdmin={project.isAdmin} />
            <MeetingCard projectId={id} />
          </div>
          <ClientMainTabs projectId={id} className="lg:col-span-2 lg:h-full" />
        </div>
      )}
    </div>
  );
}
