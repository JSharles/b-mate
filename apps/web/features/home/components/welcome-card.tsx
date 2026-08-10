"use client";

import { useTranslations } from "next-intl";
import type { User } from "schemas";
import { Skeleton } from "@/shared/components/ui/skeleton";

interface WelcomeCardProps {
  user: User | null | undefined;
  isPending: boolean;
}

// 2026-08-10: dropped the card/avatar/edit-profile-button treatment — a
// plain line is enough context for a page whose real content is the
// project list right below it, for both a contributor and a client.
// Not a heading (impeccable polish pass, same date): this page's actual
// h1 is ProjectList's own "Vos projets" — a personal greeting isn't the
// page's subject, and rendering both as headings had the greeting (h1,
// text-xl) reading *smaller* than the section title after it (h2,
// text-2xl), an inverted hierarchy. A quiet, muted line above the real
// heading reads correctly as a preamble to it, not a competing title.
export function WelcomeCard({ user, isPending }: WelcomeCardProps) {
  const t = useTranslations("Home");

  if (isPending || !user) {
    return <Skeleton className="h-5 w-40" />;
  }

  return (
    <p className="text-sm text-muted-foreground">
      {t("welcome", { firstName: user.firstName })}
    </p>
  );
}
