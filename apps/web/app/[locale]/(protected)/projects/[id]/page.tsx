"use client";

import { BookOpen, FileText, Map, Search, TriangleAlert, Video } from "lucide-react";
import { useTranslations } from "next-intl";
import { use } from "react";
import { BoardConnectionCard } from "@/features/board-connections/components/board-connection-card";
import { CurrentTaskCard } from "@/features/current-task/components/current-task-card";
import { InviteButton } from "@/features/invitations/components/invite-button";
import { InvitationsList } from "@/features/invitations/components/invitations-list";
import { ComingSoonCard } from "@/features/projects/components/coming-soon-card";
import { DeveloperCard } from "@/features/projects/components/developer-card";
import { ProjectMembersList } from "@/features/projects/components/project-members-list";
import { useProject } from "@/features/projects/hooks";
import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";

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

  // Shared between both role branches below (identical content either way —
  // only the internal Pending section/Invite button are admin-gated); each
  // render only ever mounts one of the two branches, so reusing this element
  // in two possible spots is safe.
  const teamCard = (
    // min-h-0 keeps this card at the grid row's actual height instead of
    // its own content height (CSS Grid items default to min-height: auto,
    // which otherwise wins over a track sized by the parent's flex-1 — see
    // ComingSoonCard for the fuller explanation of this bug class).
    <Card className="h-full min-h-0 overflow-hidden">
      <CardHeader>
        <CardTitle>
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            {t("team")}
          </h2>
        </CardTitle>
        {project.isAdmin && (
          <CardAction>
            <InviteButton projectId={id} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex min-h-0 flex-col gap-3 overflow-y-auto">
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t("active")}
          </h3>
          <ProjectMembersList projectId={id} canManageMembers={project.isAdmin} />
        </div>

        {project.isAdmin && (
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t("pending")}
            </h3>
            <InvitationsList projectId={id} />
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <h1 className="shrink-0 text-2xl font-semibold">{project.title}</h1>

      {isContributor ? (
        <>
          {teamCard}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <BoardConnectionCard projectId={id} />
            <ComingSoonCard
              icon={BookOpen}
              title={t("documentation")}
              message={t("comingSoon")}
            />
          </div>
        </>
      ) : (
        <>
          {/* Row 1: who's building it, and what they're doing right now —
              leads the page, not Row 2, per critique feedback (P1): a
              live-tested pass found the placeholder-heavy row landing
              first undermined the Signature Card's visual weight with
              worse positional weight (top-left is the most-scanned spot,
              and it read "Coming soon" before it read "Current task").
              Developer stays portrait; Current Task shares the row instead
              of spanning full-width, but keeps its own Signature Card
              treatment (glow, ring, pulse — plus an idle variant when
              nothing's in progress, so a fresh project doesn't collapse
              back into looking like a placeholder). */}
          <div className="grid grid-cols-1 gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-3">
            <DeveloperCard projectId={id} />
            <div className="lg:col-span-2">
              <CurrentTaskCard projectId={id} />
            </div>
          </div>

          {/* Row 2: orientation — what this project is and who has access
              to it, plus quick access to the sections that aren't built
              yet. Overview, Team, and the not-yet-built tile grid sit as
              three equal columns side by side (horizontal, not stacked) —
              each becomes clickable once it has real content. This row and
              Row 1 above both get lg:flex-1, so together they always fill
              exactly the space actually available on screen (grows or
              shrinks with the viewport) instead of guessing a fixed height
              — no leftover empty space, no scrolling. Within the tile
              grid, Roadmap gets a visually larger slot than Discovery
              audit / Documentation / Meetings: PRODUCT.md names current
              task and roadmap as the two core client-facing pillars, so
              Roadmap shouldn't read as interchangeable with sections the
              spec never calls core. */}
          <div className="grid grid-cols-1 gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-3">
            <ComingSoonCard
              icon={FileText}
              title={t("overview")}
              message={t("comingSoon")}
              className="h-full"
            />
            {teamCard}
            <div className="grid h-full min-h-0 grid-rows-[2fr_1fr] gap-3">
              <ComingSoonCard
                icon={Map}
                title={t("roadmap")}
                hint={t("roadmapHint")}
                compact
              />
              <div className="grid min-h-0 grid-cols-1 gap-3 sm:grid-cols-3">
                <ComingSoonCard
                  icon={Search}
                  title={t("discoveryAudit")}
                  hint={t("discoveryAuditHint")}
                  compact
                />
                <ComingSoonCard
                  icon={BookOpen}
                  title={t("clientDocumentation")}
                  hint={t("clientDocumentationHint")}
                  compact
                />
                <ComingSoonCard
                  icon={Video}
                  title={t("meetings")}
                  hint={t("meetingsHint")}
                  compact
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
