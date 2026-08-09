"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { ProfileForm } from "@/features/auth/components/profile-form";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useCurrentUser } from "@/shared/hooks/use-current-user";

export default function ProfilePage() {
  const { data: user, isPending } = useCurrentUser();
  const router = useRouter();
  const t = useTranslations("Profile");

  if (isPending) {
    return <Skeleton className="h-24 w-full max-w-sm" />;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      {/* /profile is reached from the global top-nav dropdown on any page,
          not just a project page — router.back() returns to wherever the
          user actually came from, rather than a hardcoded destination that
          would be wrong most of the time. */}
      <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => router.back()}>
        <ArrowLeft className="size-4" />
        {t("back")}
      </Button>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          {user.firstName} {user.lastName}
        </h1>
        <p className="text-muted-foreground">{user.email}</p>
      </div>
      <ProfileForm user={user} />
    </div>
  );
}
