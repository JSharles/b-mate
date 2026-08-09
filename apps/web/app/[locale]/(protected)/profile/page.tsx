"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { ProfileFields } from "@/features/auth/components/profile-fields";
import { useRouter } from "@/i18n/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useCurrentUser } from "@/shared/hooks/use-current-user";

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

export default function ProfilePage() {
  const { data: user, isPending } = useCurrentUser();
  const router = useRouter();
  const t = useTranslations("Profile");

  if (isPending) {
    return <Skeleton className="h-24 w-full max-w-lg" />;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex w-full max-w-lg flex-col gap-6">
      {/* /profile is reached from the global top-nav dropdown on any page,
          not just a project page — router.back() returns to wherever the
          user actually came from, rather than a hardcoded destination that
          would be wrong most of the time. */}
      <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => router.back()}>
        <ArrowLeft className="size-4" />
        {t("back")}
      </Button>

      <div className="flex items-center gap-4">
        <Avatar className="size-16">
          <AvatarImage src={user.image ?? undefined} alt="" />
          <AvatarFallback className="text-lg font-semibold">
            {initials(user.firstName, user.lastName)}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col">
          <h1 className="text-xl font-semibold">
            {user.firstName} {user.lastName}
          </h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
      </div>

      <ProfileFields user={user} />
    </div>
  );
}
