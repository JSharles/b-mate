"use client";

import { useTranslations } from "next-intl";
import type { User } from "schemas";
import { Skeleton } from "@/shared/components/ui/skeleton";

interface WelcomeCardProps {
  user: User | null | undefined;
  isPending: boolean;
}

// 2026-08-10: dropped the card/avatar/edit-profile-button treatment — a
// plain heading is enough context for a page whose real content is the
// project list right below it, for both a contributor and a client.
export function WelcomeCard({ user, isPending }: WelcomeCardProps) {
  const t = useTranslations("Home");

  if (isPending || !user) {
    return <Skeleton className="h-8 w-48" />;
  }

  return <h1 className="text-xl font-semibold">{t("welcome", { firstName: user.firstName })}</h1>;
}
