"use client";

import { useTranslations } from "next-intl";
import type { ProjectDateFormat, ProjectLanguage } from "schemas";
import { SettingsRow } from "@/shared/components/settings-row";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { useProject, useUpdateProject } from "../hooks";

// Intl.supportedValuesOf is standard (Node 18+, all evergreen browsers) —
// no need for a timezone-data package or a hand-curated shortlist.
const TIMEZONES = Intl.supportedValuesOf("timeZone");

const DATE_FORMATS: ProjectDateFormat[] = ["mdy", "dmy", "ymd"];
const LANGUAGES: ProjectLanguage[] = ["en", "fr"];

// 2026-08-09: a developer can work with clients in several countries at
// once — timezone/date format/language are per-project preferences (not
// per-user, and there's no per-user profile-editing surface today anyway),
// so each project's client sees dates and content the way that specific
// client expects. Not yet consumed by any date-rendering or content-
// localization logic elsewhere in the app — same "field exists before the
// feature that reads it" precedent as meetingUrl. Selecting a value saves
// immediately (no separate save step), matching the Notion settings page
// this was modeled on.
export function ProjectPreferences({ projectId }: { projectId: string }) {
  const { data: project } = useProject(projectId);
  const update = useUpdateProject(projectId);
  const t = useTranslations("Projects.ProjectPreferences");

  return (
    <>
      <SettingsRow title={t("timezone")} description={t("timezoneHint")}>
        <Select
          value={project?.timezone ?? undefined}
          onValueChange={(value) => update.mutate({ timezone: value })}
        >
          <SelectTrigger size="sm" className="w-56">
            <SelectValue placeholder={t("timezonePlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {TIMEZONES.map((timezone) => (
              <SelectItem key={timezone} value={timezone}>
                {timezone}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsRow>

      <SettingsRow title={t("dateFormat")} description={t("dateFormatHint")}>
        <Select
          value={project?.dateFormat ?? undefined}
          onValueChange={(value) => update.mutate({ dateFormat: value as ProjectDateFormat })}
        >
          <SelectTrigger size="sm" className="w-56">
            <SelectValue placeholder={t("dateFormatPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {DATE_FORMATS.map((format) => (
              <SelectItem key={format} value={format}>
                {t(`dateFormatOption.${format}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsRow>

      <SettingsRow title={t("language")} description={t("languageHint")}>
        <Select
          value={project?.language ?? undefined}
          onValueChange={(value) => update.mutate({ language: value as ProjectLanguage })}
        >
          <SelectTrigger size="sm" className="w-40">
            <SelectValue placeholder={t("languagePlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((language) => (
              <SelectItem key={language} value={language}>
                {t(`languageOption.${language}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsRow>
    </>
  );
}
