"use client";

import { TriangleAlert, Video } from "lucide-react";
import { useTranslations } from "next-intl";
import { Suspense, use } from "react";
import { BoardConnectionCard } from "@/features/board-connections/components/board-connection-card";
import { DocumentationSummaryCard } from "@/features/documentation/components/documentation-summary-card";
import { NotionConnectionCard } from "@/features/notion-connection/components/notion-connection-card";
import { MeetingCard } from "@/features/projects/components/meeting-card";
import { MeetingLinkCard } from "@/features/projects/components/meeting-link-card";
import { ProjectPreferences } from "@/features/projects/components/project-preferences";
import { TeamPanel } from "@/features/projects/components/team-panel";
import { TeamSummaryCard } from "@/features/projects/components/team-summary-card";
import { useProject } from "@/features/projects/hooks";
import { Button } from "@/shared/components/ui/button";
import { SettingsSectionHeading } from "@/shared/components/settings-section-heading";
import { Skeleton } from "@/shared/components/ui/skeleton";
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
    // Both branches are natural-height now, not forced to fill the
    // viewport — see the client branch's own comment below for why the
    // last remnant of that (ClientMainTabs' lg:h-full) was dropped too.
    <div className="flex w-full flex-col gap-6">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-4">
        <h1 className="min-w-0 truncate text-2xl font-semibold">{project.title}</h1>
        {/* Contributor-only: on their page the meeting link is just one
            compact row in a long settings list (MeetingLinkCard), easy to
            miss, so this header shortcut earns its place. On the client
            page MeetingCard is already a full, prominent sidebar card with
            its own "Join meeting" button — a second one up here would just
            be the same action shown twice. */}
        {isContributor && project.meetingUrl && (
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
          <DocumentationSummaryCard projectId={id} />
          <TeamSummaryCard projectId={id} isAdmin={project.isAdmin} />

          <div id="project-tools">
            <SettingsSectionHeading>{t("tools")}</SettingsSectionHeading>
          </div>
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
        // Redesigned 2026-08-09, third pass (previous version reported:
        // Resources buried in a nested 1fr sub-cell, squeezed illegible on
        // a shorter viewport, and outranked in visual weight by two
        // "coming soon" placeholders with zero real content). A second pass
        // fixed the squeeze but still framed Resources as a secondary card
        // next to Current Task's hero — Current Task and the AI-detected
        // document categories (Roadmap resurfaces here too, once a
        // developer writes/uploads one — it isn't a separate feature
        // anymore) now live together as tabs in one containerless surface,
        // Current Task first and open by default. That second pass also
        // forced the tabs area to fill the full remaining viewport height
        // (lg:h-full) regardless of content — fine for a tab with many
        // resources, but with a real (short) vulgarized task write-up this
        // left the Signature Card's glass panel mostly empty, its glow
        // blobs diluted across a huge dead zone below the actual text (seen
        // live once a board was actually connected). Dropped in favor of
        // natural content height, same fix already applied to the
        // contributor branch above for the same reason. Developer + Team +
        // the Meetings placeholder stay in a narrow sidebar (self-start:
        // it must not stretch to match whatever height the tabs column
        // ends up at).
        <div className="grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:self-start">
            <TeamPanel projectId={id} isAdmin={project.isAdmin} />
            <MeetingCard projectId={id} />
          </div>
          <ClientMainTabs projectId={id} className="lg:col-span-2" />
        </div>
      )}
    </div>
  );
}
