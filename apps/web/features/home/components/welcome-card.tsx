"use client";

import { useTranslations } from "next-intl";
import type { User } from "schemas";
import { Link } from "@/i18n/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";

function initials(user: User) {
  return `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase();
}

interface WelcomeCardProps {
  user: User | undefined;
  isPending: boolean;
}

export function WelcomeCard({ user, isPending }: WelcomeCardProps) {
  const t = useTranslations("Home");

  if (isPending || !user) {
    return <Skeleton className="h-28 w-full" />;
  }

  const subtitle = [user.roleTitle, user.company].filter(Boolean).join(" · ");

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-4">
        <Avatar size="lg">
          {user.image ? <AvatarImage src={user.image} alt="" /> : null}
          <AvatarFallback className="text-base">{initials(user)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h1 className="text-xl font-semibold">{t("welcome", { firstName: user.firstName })}</h1>
          {subtitle ? <p className="truncate text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        <Button variant="outline" asChild>
          <Link href="/profile">{t("editProfile")}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
