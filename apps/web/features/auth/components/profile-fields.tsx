"use client";

import { useTranslations } from "next-intl";
import type { User } from "schemas";
import { EditableField } from "./editable-field";

// github/linkedin/malt/website are rendered as real links on the client-
// facing identity card (TeamPanel) — a bare username there would build a
// broken URL, so the placeholder asks for a domain-inclusive value up
// front rather than silently mangling whatever's typed.
const PLACEHOLDERS = {
  github: "github.com/username",
  linkedin: "linkedin.com/in/username",
  malt: "malt.fr/profile/username",
  website: "yoursite.com",
} as const;

// GitHub (a code host) and Malt (a French freelance-developer marketplace)
// only mean anything for a developer account.
export function ProfileFields({ user }: { user: User }) {
  const t = useTranslations("Profile");

  return (
    <div className="flex flex-col">
      <EditableField fieldKey="roleTitle" label={t("roleTitle")} value={user.roleTitle} />
      <EditableField fieldKey="phone" label={t("phone")} value={user.phone} />
      {user.accountKind === "developer" && (
        <EditableField
          fieldKey="github"
          label={t("github")}
          value={user.github}
          placeholder={PLACEHOLDERS.github}
        />
      )}
      <EditableField
        fieldKey="linkedin"
        label={t("linkedin")}
        value={user.linkedin}
        placeholder={PLACEHOLDERS.linkedin}
      />
      {user.accountKind === "developer" && (
        <EditableField
          fieldKey="malt"
          label={t("malt")}
          value={user.malt}
          placeholder={PLACEHOLDERS.malt}
        />
      )}
      <EditableField
        fieldKey="website"
        label={t("website")}
        value={user.website}
        placeholder={PLACEHOLDERS.website}
      />
    </div>
  );
}
